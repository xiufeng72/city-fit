(function () {
  var SESSION_KEY = 'cf_session';
  var ANSWERS_KEY = 'cf_answers';

  var codeEl = document.getElementById('code');
  var errEl = document.getElementById('err');
  var startEl = document.getElementById('start');
  var resumeEl = document.getElementById('resume');

  function readSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
  }

  function showResume() {
    if (!resumeEl) return;
    var s = readSession();
    if (!s || !s.sessionId) { resumeEl.classList.add('hidden'); return; }
    if (s.resultId) {
      resumeEl.innerHTML = '上次的结果：<a href="' + CF.resultPage(s.resultId) + '">继续查看</a>';
      resumeEl.classList.remove('hidden');
      return;
    }
    if (s.done > 0) {
      resumeEl.innerHTML = '上次答到第 ' + s.done + ' / 50 题：<a href="' + CF.page('test.html') + '">继续答题</a>';
      resumeEl.classList.remove('hidden');
      return;
    }
    resumeEl.classList.add('hidden');
  }

  function setErr(msg) {
    errEl.textContent = msg || '';
  }

  function redeem(code) {
    if (!CF.ready) {
      setErr(CF.message());
      return;
    }
    startEl.disabled = true;
    startEl.textContent = '正在验证…';
    setErr('');

    CF.client.rpc('redeem_card', { p_code: code }).then(function (res) {
      if (res.error) throw res.error;
      var data = res.data || {};
      if (!data.ok) {
        setErr(data.error || '卡密不可用');
        return;
      }
      var session = {
        sessionId: data.sessionId,
        code: code,
        done: 0,
        resultId: ''
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      localStorage.removeItem(ANSWERS_KEY);
      location.href = CF.page('test.html');
    }).catch(function (e) {
      setErr(CF.message(e));
    }).then(function () {
      startEl.disabled = false;
      startEl.textContent = '开始测试';
    });
  }

  startEl.addEventListener('click', function () {
    var code = (codeEl.value || '').trim().toUpperCase();
    if (!/^[A-Z0-9-]{6,32}$/.test(code)) {
      setErr('请输入完整的卡密，例如 CITY-ABCD-2345');
      return;
    }
    redeem(code);
  });

  codeEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') startEl.click();
  });

  showResume();
})();
