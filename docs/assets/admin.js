(function () {
  var loginBox = document.getElementById('loginBox');
  var panel = document.getElementById('panel');
  var emailEl = document.getElementById('email');
  var pwdEl = document.getElementById('pwd');
  var loginBtn = document.getElementById('loginBtn');
  var loginErr = document.getElementById('loginErr');
  var toastEl = document.getElementById('toast');

  var cards = [];
  var currentUser = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(function () { toastEl.classList.remove('show'); }, 2400);
  }
  function err(msg) { loginErr.textContent = msg || ''; }
  function timeText(v) {
    if (!v) return '—';
    var d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return d.toLocaleString('zh-CN', { hour12: false });
  }
  function statusText(s) {
    return s === 'unused' ? '未使用' : (s === 'in_use' ? '部分使用' : '已用完');
  }
  function limitOf(c) { return c.max_uses == null ? 2 : c.max_uses; }
  function usedOf(c) { return c.used_count == null ? 0 : c.used_count; }
  function remainOf(c) { return Math.max(limitOf(c) - usedOf(c), 0); }

  function buildPanel(user) {
    panel.innerHTML =
      '<div class="admin-bar"><div class="who">已登录：' + esc(user.email || '') + '</div>' +
      '<div class="admin-actions"><button class="btn ghost" id="logout">退出</button></div></div>' +
      '<div class="stats" id="stats">正在读取…</div>' +
      '<div class="card" style="margin-top:14px">' +
        '<div style="font-size:14px;font-weight:700;color:#123b33;margin-bottom:10px">批量生成</div>' +
        '<div class="row2"><input id="count" class="input" type="number" min="1" max="500" value="20" placeholder="数量">' +
        '<button class="btn" id="genBtn">生成</button></div>' +
        '<div class="row2" style="margin-top:8px"><input id="prefix" class="input" type="text" value="CITY" maxlength="8" placeholder="前缀">' +
        '<span style="flex:0 0 92px"></span></div>' +
        '<input id="note" type="text" maxlength="80" placeholder="备注（可选，例如：11 月投放）">' +
        '<div id="genOut" class="hidden" style="margin-top:14px">' +
          '<textarea id="genCodes" readonly style="width:100%;height:130px;border:1px solid #e1ede9;border-radius:10px;padding:10px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.7;background:#f7fbfa"></textarea>' +
          '<button class="btn ghost sm mt8" id="copyCodes">复制全部</button>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin:20px 0 4px">' +
        '<div style="font-size:14px;font-weight:700;color:#123b33">卡密列表</div>' +
        '<div style="display:flex;gap:8px;align-items:center">' +
          '<select id="filter" style="border:1px solid #e1ede9;border-radius:8px;padding:6px 8px;font-size:12.5px;color:#3c4b46;background:#fff">' +
            '<option value="all">全部</option><option value="unused">未使用</option>' +
            '<option value="in_use">部分使用</option><option value="used">已用完</option>' +
          '</select>' +
          '<button class="btn ghost" id="exportBtn" style="width:auto;height:32px;font-size:12.5px;padding:0 12px;border-radius:8px">导出 CSV</button>' +
        '</div>' +
      '</div>' +
      '<div class="small muted" id="tableHint"></div>' +
      '<table><thead><tr><th>卡密</th><th>状态</th><th>剩余</th><th>使用时间</th><th>结果</th></tr></thead><tbody id="rows"></tbody></table>';

    document.getElementById('logout').addEventListener('click', function () {
      CF.client.auth.signOut().then(function () { location.reload(); });
    });
    document.getElementById('genBtn').addEventListener('click', generate);
    document.getElementById('copyCodes').addEventListener('click', function () {
      var ta = document.getElementById('genCodes');
      ta.select();
      try { document.execCommand('copy'); toast('已复制'); } catch (e) { toast('请手动复制'); }
    });
    document.getElementById('filter').addEventListener('change', renderRows);
    document.getElementById('exportBtn').addEventListener('click', exportCsv);

    loadAll();
    document.getElementById('genBtn').disabled = false;
  }

  function loadAll() {
    CF.client.rpc('admin_stats').then(function (res) {
      var s = res.data || {};
      document.getElementById('stats').innerHTML =
        '<div class="stat"><b>' + (s.total || 0) + '</b><span>总数</span></div>' +
        '<div class="stat"><b>' + (s.unused || 0) + '</b><span>未使用</span></div>' +
        '<div class="stat"><b>' + (s.inUse || 0) + '</b><span>部分使用</span></div>' +
        '<div class="stat"><b>' + (s.used || 0) + '</b><span>已用完</span></div>';
    }).catch(function (e) {
      document.getElementById('stats').textContent = CF.message(e);
    });

    cards = [];
    fetchPage(0).catch(function (e) {
      document.getElementById('tableHint').textContent = CF.message(e);
    });
  }

  // Supabase 单次最多返回 1000 行，分页拉取，导出才是全量。
  function fetchPage(page) {
    var from = page * 1000;
    return CF.client.from('cards')
      .select('code,status,note,created_at,used_at,result_id,max_uses,used_count')
      .order('created_at', { ascending: false })
      .range(from, from + 999)
      .then(function (res) {
        if (res.error) throw res.error;
        var rows = res.data || [];
        cards = cards.concat(rows);
        if (rows.length === 1000 && page < 9) return fetchPage(page + 1);
        renderRows();
      });
  }

  function renderRows() {
    var filter = document.getElementById('filter').value;
    var list = cards.filter(function (c) { return filter === 'all' || c.status === filter; });
    document.getElementById('tableHint').textContent =
      '显示 ' + list.length + ' / ' + cards.length + ' 条（最多加载最近 1000 条）';
    document.getElementById('rows').innerHTML = list.map(function (c) {
      var link = c.result_id
        ? '<a href="' + esc(CF.shareLink(c.result_id)) + '" target="_blank" rel="noopener">查看</a>'
        : '—';
      return '<tr><td class="code">' + esc(c.code) + '</td>' +
        '<td><span class="badge ' + esc(c.status) + '">' + statusText(c.status) + '</span></td>' +
        '<td>' + remainOf(c) + ' / ' + limitOf(c) + '</td>' +
        '<td>' + esc(timeText(c.used_at)) + '</td><td>' + link + '</td></tr>';
    }).join('');
  }

  function generate() {
    var count = parseInt(document.getElementById('count').value, 10) || 20;
    var prefix = (document.getElementById('prefix').value || 'CITY').trim();
    var note = (document.getElementById('note').value || '').trim();
    var btn = document.getElementById('genBtn');
    btn.disabled = true;
    btn.textContent = '生成中…';

    CF.client.rpc('admin_generate_cards', { p_count: count, p_prefix: prefix, p_note: note })
      .then(function (res) {
        if (res.error) throw res.error;
        var codes = res.data || [];
        document.getElementById('genCodes').value = codes.join('\n');
        document.getElementById('genOut').classList.remove('hidden');
        toast('已生成 ' + codes.length + ' 条');
        loadAll();
      })
      .catch(function (e) { toast(CF.message(e)); })
      .then(function () {
        btn.disabled = false;
        btn.textContent = '生成';
      });
  }

  function exportCsv() {
    if (!cards.length) { toast('还没有数据'); return; }
    var head = ['code', 'status', 'remaining', 'max_uses', 'used_count', 'note', 'created_at', 'used_at', 'result_id'];
    var lines = [head.join(',')];
    cards.forEach(function (c) {
      var vals = [c.code, c.status, remainOf(c), limitOf(c), usedOf(c), c.note, c.created_at, c.used_at, c.result_id];
      lines.push(vals.map(function (v) {
        var s = v == null ? '' : String(v);
        return '"' + s.replace(/"/g, '""') + '"';
      }).join(','));
    });
    var blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'cards-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
  }

  function showLogin() {
    loginBox.classList.remove('hidden');
    panel.innerHTML = '';
  }

  function showDenied(email) {
    loginBox.classList.add('hidden');
    panel.innerHTML = '<div class="card" style="margin-top:24px"><b>' + esc(email) + '</b>' +
      '<p class="small muted mt8">这个账号不在 admins 表里，没有管理员权限。请先在 Supabase SQL Editor 里把它加入 admins。</p>' +
      '<button class="btn ghost mt16" id="logout">退出登录</button></div>';
    document.getElementById('logout').addEventListener('click', function () {
      CF.client.auth.signOut().then(function () { location.reload(); });
    });
  }

  function checkAdmin(user) {
    currentUser = user;
    CF.client.rpc('is_admin').then(function (res) {
      if (res.data === true) {
        loginBox.classList.add('hidden');
        buildPanel(user);
      } else {
        showDenied(user.email || '');
      }
    }).catch(function (e) {
      showLogin();
      err(CF.message(e));
    });
  }

  function login() {
    var email = (emailEl.value || '').trim();
    var pwd = pwdEl.value || '';
    if (!email || !pwd) { err('请填写邮箱和密码'); return; }
    err('');
    loginBtn.disabled = true;
    loginBtn.textContent = '登录中…';
    CF.client.auth.signInWithPassword({ email: email, password: pwd }).then(function (res) {
      if (res.error) throw res.error;
      checkAdmin(res.data.user);
    }).catch(function (e) {
      err(/Invalid login credentials/i.test(e.message || '') ? '邮箱或密码不正确' : CF.message(e));
    }).then(function () {
      loginBtn.disabled = false;
      loginBtn.textContent = '登录';
    });
  }

  loginBtn.addEventListener('click', login);
  pwdEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') login(); });

  if (!CF.ready) {
    showLogin();
    err(CF.message());
    loginBtn.disabled = true;
    return;
  }

  CF.client.auth.getSession().then(function (res) {
    var session = res.data.session;
    if (session && session.user) checkAdmin(session.user);
    else showLogin();
  });
})();
