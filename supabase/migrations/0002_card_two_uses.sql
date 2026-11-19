-- 0002：卡密改为「一张卡可用两次」
-- 在 Supabase SQL Editor 整段执行；可重复执行。
-- 旧数据不重置：历史 unused 记 0 次，历史 in_use / used 记 1 次，上限统一 2 次。

-- ---------------------------------------------------------------- 字段

alter table public.cards add column if not exists max_uses   integer not null default 2;
alter table public.cards add column if not exists used_count integer not null default 0;

-- 历史卡密按已消耗 1 次计算（旧规则下只要兑换过就算用掉）
update public.cards
   set used_count = 1
 where used_count = 0
   and status <> 'unused';

-- 状态与次数对齐：0=未使用，用满=已用完，其余=部分使用
update public.cards
   set status = case
                  when used_count <= 0 then 'unused'
                  when used_count >= max_uses then 'used'
                  else 'in_use'
                end;

-- ---------------------------------------------------------------- 兑换（原子扣减）

create or replace function public.redeem_card(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_max  integer;
  v_used integer;
  v_sid  text;
begin
  v_code := upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g'));

  if v_code !~ '^[A-Z0-9-]{6,32}$' then
    return jsonb_build_object('ok', false, 'error', '卡密格式不正确');
  end if;

  -- 先锁行，再判断剩余次数，避免并发超扣
  select max_uses, used_count
    into v_max, v_used
    from public.cards
   where code = v_code
     for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', '卡密不存在，请核对');
  end if;

  if v_used >= v_max then
    return jsonb_build_object(
      'ok', false,
      'error', '这个卡密的使用次数已经用完（' || v_max || '/' || v_max || '）',
      'remaining', 0,
      'maxUses', v_max
    );
  end if;

  insert into public.sessions (code) values (v_code) returning id into v_sid;

  update public.cards
     set used_count = used_count + 1,
         status = case when used_count + 1 >= max_uses then 'used' else 'in_use' end,
         used_at = coalesce(used_at, now()),
         session_id = v_sid
   where code = v_code
     and used_count < max_uses;

  if not found then
    delete from public.sessions where id = v_sid;
    return jsonb_build_object('ok', false, 'error', '这个卡密的使用次数已经用完', 'remaining', 0);
  end if;

  return jsonb_build_object(
    'ok', true,
    'sessionId', v_sid,
    'remaining', v_max - v_used - 1,
    'maxUses', v_max
  );
end;
$$;

revoke all on function public.redeem_card(text) from public;
grant execute on function public.redeem_card(text) to anon, authenticated;

-- ---------------------------------------------------------------- 结果落库（不再把状态写死成 used）

create or replace function public.finalize_result(
  p_session_id text,
  p_result_id  text,
  p_data       jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code      text;
  v_submitted timestamptz;
  v_existing  text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden';
  end if;

  select code, submitted_at, result_id
    into v_code, v_submitted, v_existing
    from public.sessions
   where id = p_session_id
     for update;

  if v_code is null then
    raise exception 'session_not_found';
  end if;

  if v_submitted is not null then
    return coalesce(v_existing, '');
  end if;

  insert into public.results (id, data) values (p_result_id, p_data)
  on conflict (id) do nothing;

  update public.sessions
     set submitted_at = now(),
         result_id = p_result_id
   where id = p_session_id;

  -- 卡密状态由使用次数决定，这里只记录最近一次结果。
  update public.cards
     set result_id = p_result_id,
         used_at = coalesce(used_at, now())
   where code = v_code;

  return p_result_id;
end;
$$;

revoke all on function public.finalize_result(text, text, jsonb) from public;
revoke all on function public.finalize_result(text, text, jsonb) from anon, authenticated;
grant execute on function public.finalize_result(text, text, jsonb) to service_role;

-- ---------------------------------------------------------------- 统计

create or replace function public.admin_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  return (
    select jsonb_build_object(
      'total', count(*),
      'unused', count(*) filter (where used_count <= 0),
      'inUse', count(*) filter (where used_count > 0 and used_count < max_uses),
      'used', count(*) filter (where used_count >= max_uses),
      'usesLeft', coalesce(sum(greatest(max_uses - used_count, 0)), 0)
    ) from public.cards
  );
end;
$$;

revoke all on function public.admin_stats() from public;
grant execute on function public.admin_stats() to authenticated;

-- ---------------------------------------------------------------- 生成（默认 2 次）

create or replace function public.admin_generate_cards(
  p_count  integer default 10,
  p_prefix text default 'CITY',
  p_note   text default null
)
returns setof text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chars    constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_count    integer;
  v_prefix   text;
  v_i        integer := 0;
  v_attempts integer := 0;
  v_code     text;
  v_out      text[] := '{}';
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  v_count := least(greatest(coalesce(p_count, 10), 1), 500);
  v_prefix := upper(regexp_replace(coalesce(nullif(trim(p_prefix), ''), 'CITY'), '[^A-Za-z0-9]', '', 'g'));
  v_prefix := left(coalesce(nullif(v_prefix, ''), 'CITY'), 8);

  while v_i < v_count and v_attempts < v_count * 30 loop
    v_attempts := v_attempts + 1;
    v_code := v_prefix || '-' ||
      substr(v_chars, (1 + floor(random() * length(v_chars)))::int, 1) ||
      substr(v_chars, (1 + floor(random() * length(v_chars)))::int, 1) ||
      substr(v_chars, (1 + floor(random() * length(v_chars)))::int, 1) ||
      substr(v_chars, (1 + floor(random() * length(v_chars)))::int, 1) ||
      '-' ||
      substr(v_chars, (1 + floor(random() * length(v_chars)))::int, 1) ||
      substr(v_chars, (1 + floor(random() * length(v_chars)))::int, 1) ||
      substr(v_chars, (1 + floor(random() * length(v_chars)))::int, 1) ||
      substr(v_chars, (1 + floor(random() * length(v_chars)))::int, 1);

    begin
      insert into public.cards (code, note, max_uses, used_count)
      values (v_code, coalesce(p_note, ''), 2, 0);
      v_out := array_append(v_out, v_code);
      v_i := v_i + 1;
    exception when unique_violation then
      null;
    end;
  end loop;

  return query select unnest(v_out);
end;
$$;

revoke all on function public.admin_generate_cards(integer, text, text) from public;
grant execute on function public.admin_generate_cards(integer, text, text) to authenticated;
