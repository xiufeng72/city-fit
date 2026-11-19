-- 城市测评 · Supabase 初始化
-- 在 Supabase Dashboard → SQL Editor 里整段执行。
-- 设计原则：
--   1) 卡密兑换、扣减、结果写入全部在服务端完成；
--   2) anon 只能调用 redeem_card / get_result 两个 RPC；
--   3) 结果表不开放直接 select，只能按 id 取单条；
--   4) 管理操作要求 Supabase Auth 登录且出现在 admins 表中。

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- 表

create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);

create table if not exists public.cards (
  code       text primary key,
  status     text not null default 'unused'
             check (status in ('unused', 'in_use', 'used')),
  note       text not null default '',
  created_at timestamptz not null default now(),
  used_at    timestamptz,
  session_id text,
  result_id  text
);

create table if not exists public.sessions (
  id           text primary key default replace(gen_random_uuid()::text, '-', ''),
  code         text not null references public.cards(code) on update cascade,
  created_at   timestamptz not null default now(),
  submitted_at timestamptz,
  result_id    text
);

create table if not exists public.results (
  id         text primary key,
  data       jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists cards_status_idx on public.cards (status);
create index if not exists cards_created_idx on public.cards (created_at desc);
create index if not exists sessions_code_idx on public.sessions (code);
create index if not exists results_created_idx on public.results (created_at desc);

-- ---------------------------------------------------------------- 权限基础

alter table public.admins enable row level security;
alter table public.cards enable row level security;
alter table public.sessions enable row level security;
alter table public.results enable row level security;

revoke all on public.cards from anon, authenticated;
revoke all on public.sessions from anon, authenticated;
revoke all on public.results from anon, authenticated;
revoke all on public.admins from anon, authenticated;

grant select on public.admins to authenticated;
grant select on public.cards to authenticated;
grant all on public.admins, public.cards, public.sessions, public.results to service_role;

-- ---------------------------------------------------------------- 管理员判定

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins a where a.user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- 管理员只能看到自己那一行，未登录看不到任何行。
drop policy if exists admins_select_self on public.admins;
create policy admins_select_self on public.admins
  for select to authenticated
  using (user_id = auth.uid());

-- 只有管理员能直接读卡密表；匿名没有任何 select 权限。
drop policy if exists cards_select_admin on public.cards;
create policy cards_select_admin on public.cards
  for select to authenticated
  using (public.is_admin());

-- sessions / results 不建任何策略：匿名与普通登录用户都无法直接读表。

-- ---------------------------------------------------------------- 卡密兑换

create or replace function public.redeem_card(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code  text;
  v_found text;
  v_sid   text;
begin
  v_code := upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g'));

  if v_code !~ '^[A-Z0-9-]{6,32}$' then
    return jsonb_build_object('ok', false, 'error', '卡密格式不正确');
  end if;

  -- 单条 update 就是原子占位：并发请求里只有一个能把 unused 改成 in_use。
  update public.cards
     set status = 'in_use',
         used_at = coalesce(used_at, now())
   where code = v_code
     and status = 'unused'
  returning code into v_found;

  if v_found is null then
    if exists (select 1 from public.cards where code = v_code) then
      return jsonb_build_object('ok', false, 'error', '这个卡密已经被使用');
    end if;
    return jsonb_build_object('ok', false, 'error', '卡密不存在，请核对');
  end if;

  insert into public.sessions (code) values (v_code) returning id into v_sid;
  update public.cards set session_id = v_sid where code = v_code;

  return jsonb_build_object('ok', true, 'sessionId', v_sid);
end;
$$;

revoke all on function public.redeem_card(text) from public;
grant execute on function public.redeem_card(text) to anon, authenticated;

-- ---------------------------------------------------------------- 结果读取（仅按 id）

create or replace function public.get_result(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_out jsonb;
begin
  if p_id is null or length(p_id) < 6 or length(p_id) > 64 then
    return jsonb_build_object('ok', false, 'error', '结果链接不正确');
  end if;

  select jsonb_build_object(
           'ok', true,
           'data', r.data,
           'createdAt', to_char(r.created_at at time zone 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI')
         )
    into v_out
    from public.results r
   where r.id = p_id;

  return coalesce(v_out, jsonb_build_object('ok', false, 'error', '结果不存在或链接已失效'));
end;
$$;

revoke all on function public.get_result(text) from public;
grant execute on function public.get_result(text) to anon, authenticated;

-- ---------------------------------------------------------------- 结果落库（仅 Edge Function）

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

  -- 重复提交返回同一份结果，保证刷新/重试不产生第二份。
  if v_submitted is not null then
    return coalesce(v_existing, '');
  end if;

  insert into public.results (id, data) values (p_result_id, p_data)
  on conflict (id) do nothing;

  update public.sessions
     set submitted_at = now(),
         result_id = p_result_id
   where id = p_session_id;

  update public.cards
     set status = 'used',
         result_id = p_result_id,
         used_at = coalesce(used_at, now())
   where code = v_code;

  return p_result_id;
end;
$$;

revoke all on function public.finalize_result(text, text, jsonb) from public;
revoke all on function public.finalize_result(text, text, jsonb) from anon, authenticated;
grant execute on function public.finalize_result(text, text, jsonb) to service_role;

-- ---------------------------------------------------------------- 管理端

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
      'unused', count(*) filter (where status = 'unused'),
      'inUse', count(*) filter (where status = 'in_use'),
      'used', count(*) filter (where status = 'used')
    ) from public.cards
  );
end;
$$;

revoke all on function public.admin_stats() from public;
grant execute on function public.admin_stats() to authenticated;

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
      insert into public.cards (code, note) values (v_code, coalesce(p_note, ''));
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

-- ---------------------------------------------------------------- 管理员开通说明
-- 1. 在 Authentication → Users 里用邮箱+密码创建管理员账号（关闭邮箱确认更方便）。
-- 2. 在本 SQL 执行后，运行：
--      insert into public.admins (user_id, email)
--      select id, email from auth.users where email = '你的管理员邮箱'
--      on conflict (user_id) do nothing;
-- 3. 管理页用该邮箱+密码登录；不是 admins 表里的账号看不到任何卡密数据。
