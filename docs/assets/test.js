(function () {
  var SESSION_KEY = 'cf_session';
  var ANSWERS_KEY = 'cf_answers';

  var clockEl = document.getElementById('clock');
  var countEl = document.getElementById('count');
  var barEl = document.getElementById('bar');
  var areaEl = document.getElementById('area');
  var backEl = document.getElementById('back');
  var nightEl = document.getElementById('nightTip');
  var submittingEl = document.getElementById('submitting');
  var toastEl = document.getElementById('toast');

  var questions = [];
  var total = 0;
  var index = 0;
  var answers = {};
  var busy = false;

  function session() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { return null; }
  }
  function saveSession(s) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  }
  function loadAnswers() {
    try { return JSON.parse(localStorage.getItem(ANSWERS_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveAnswers() {
    localStorage.setItem(ANSWERS_KEY, JSON.stringify(answers));
  }
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
  function answeredCount() { return Object.keys(answers).length; }

  function paintProgress() {
    var done = answeredCount();
    countEl.textContent = '第 ' + (index + 1) + ' / ' + total + ' 题';
    barEl.style.width = Math.round(done / total * 100) + '%';
  }

  function paint() {
    var q = questions[index];
    if (!q) return;
    clockEl.textContent = q.time || '';
    nightEl.classList.toggle('show', index >= Math.floor(total / 2));
    backEl.disabled = index === 0;
    backEl.style.opacity = index === 0 ? '.4' : '1';

    var opts = q.options.map(function (o) {
      var on = answers[q.id] === o.key ? ' on' : '';
      return '<button class="opt' + on + '" data-k="' + esc(o.key) + '" type="button">' +
        '<span class="k">' + esc(o.key) + '</span><span class="t">' + esc(o.text) + '</span></button>';
    }).join('');

    areaEl.innerHTML =
      '<div class="fade-in">' +
      '<div class="q-index">QUESTION ' + (index + 1) + (q.kind ? ' · ' + esc(q.kind) : '') + '</div>' +
      '<h2 class="q-title">' + esc(q.title) + '</h2>' +
      '<p class="q-text">' + esc(q.text) + '</p>' +
      '<div class="opts" id="opts">' + opts + '</div>' +
      '</div>';

    paintProgress();

    var buttons = areaEl.querySelectorAll('.opt');
    for (var i = 0; i < buttons.length; i += 1) {
      buttons[i].addEventListener('click', function () {
        choose(this.getAttribute('data-k'));
      });
    }
  }

  function choose(key) {
    if (busy) return;
    var q = questions[index];
    answers[q.id] = key;
    saveAnswers();
    paintProgress();

    var s = session();
    if (s) {
      s.done = Math.max(s.done || 0, answeredCount());
      saveSession(s);
    }

    var all = areaEl.querySelectorAll('.opt');
    for (var i = 0; i < all.length; i += 1) {
      all[i].classList.toggle('on', all[i].getAttribute('data-k') === key);
    }

    busy = true;
    setTimeout(function () {
      busy = false;
      if (index < total - 1) {
        index += 1;
        paint();
      } else {
        submit();
      }
    }, 220);
  }

  function submit() {
    if (busy) return;
    busy = true;
    var s = session();
    if (!s || !s.sessionId) {
      location.replace(CF.page('index.html'));
      return;
    }
    submittingEl.classList.add('show');

    CF.client.functions.invoke(CF.cfg.SUBMIT_FUNCTION || 'submit', {
      body: { sessionId: s.sessionId, answers: answers }
    }).then(function (res) {
      if (res.error) throw res.error;
      var data = res.data || {};
      if (!data.ok) throw new Error(data.error || '提交失败');
      s.resultId = data.resultId;
      s.done = total;
      saveSession(s);
      localStorage.removeItem(ANSWERS_KEY);
      location.href = CF.resultPage(data.resultId);
    }).catch(function (e) {
      submittingEl.classList.remove('show');
      busy = false;
      toast(CF.message(e));
    });
  }

  backEl.addEventListener('click', function () {
    if (index <= 0 || busy) return;
    index -= 1;
    paint();
  });

  function boot() {
    var s = session();
    if (!CF.ready) {
      toast(CF.message());
      setTimeout(function () { location.replace(CF.page('index.html')); }, 1800);
      return;
    }
    if (!s || !s.sessionId) {
      location.replace(CF.page('index.html'));
      return;
    }
    if (s.resultId) {
      location.replace(CF.resultPage(s.resultId));
      return;
    }

    answers = loadAnswers();
    fetch('data/questions.json?v=1').then(function (r) {
      if (!r.ok) throw new Error('题库加载失败');
      return r.json();
    }).then(function (data) {
      questions = data.questions || [];
      total = questions.length || 1;
      index = Math.min(s.done || 0, total - 1);
      paint();
    }).catch(function (e) {
      areaEl.innerHTML = '<p class="q-text">题库加载失败，请刷新重试。</p>';
      console.error(e);
    });
  }

  boot();
})();
