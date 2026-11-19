(function () {
  var path = location.pathname.replace(/\/+$/, '');
  var id = '';
  var hash = location.hash || '';
  var m = path.match(/\/r\/([^\/]+)$/);
  if (m) id = decodeURIComponent(m[1]);
  if (!id) {
    var q = location.search.match(/[?&](?:r|id)=([^&]+)/);
    if (q) id = decodeURIComponent(q[1]);
  }
  if (!id) {
    var h = hash.match(/#\/?r\/([^\/?#]+)/);
    if (h) id = decodeURIComponent(h[1]);
  }

  var loading = document.getElementById('loading');
  var content = document.getElementById('content');
  var errorBox = document.getElementById('errorBox');
  var toastEl = document.getElementById('toast');
  var modal = document.getElementById('modal');

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }
  function hide(el) { if (el) el.classList.add('hidden'); }
  function show(el) { if (el) el.classList.remove('hidden'); }

  function fail(msg) {
    hide(loading);
    hide(content);
    show(errorBox);
    var p = errorBox.querySelector('p');
    if (p && msg) p.textContent = msg;
  }

  function renderLegacy(d) {
    document.getElementById('cityName').textContent = d.cityName || '—';
    document.getElementById('pct').textContent = d.pct || '--';
    document.getElementById('conclusion').textContent = d.conclusion || '';
    document.getElementById('situation').textContent =
      (d.situation || '') + ' 这是旧版七维结果，只保留城市与结论；重新测试会生成十维画像。';
    document.querySelector('.result-hero .top').textContent = '旧版结果 · 七维';
    document.querySelector('.sticky-actions').style.display = 'none';
    var sections = document.querySelector('#content .sections');
    if (sections) sections.style.display = 'none';
    document.title = d.cityName + ' · 你适合哪座城市';
    show(content);
  }

  function render(d) {
    document.getElementById('cityName').textContent = d.cityName;
    document.getElementById('pct').textContent = d.pct;
    document.getElementById('conclusion').textContent = d.conclusion;
    document.getElementById('situation').textContent = d.situation;
    document.getElementById('matchNote').textContent = d.matchNote || '';
    document.title = d.cityName + ' ' + d.pct + '% · 你适合哪座城市';

    document.getElementById('reasons').innerHTML = d.reasons.map(function (r) {
      return '<div class="reason-block"><div class="reason-title">' + esc(r.title) + '</div>' +
        '<p>' + esc(r.text) + '</p></div>';
    }).join('');

    document.getElementById('dims').innerHTML = d.dimRows.map(function (r) {
      return '<div class="dimrow' + (r.aligned ? '' : ' gap') + '">' +
        '<div class="dimrow-head"><b>' + esc(r.name) + '</b>' +
        '<span class="dimrow-score">你 ' + r.score + ' · 城市 ' + r.cityScore + '</span>' +
        '<span class="dimrow-tag">' + esc(r.label) + '</span></div>' +
        '<div class="dimrow-line"><em>你的倾向</em>' + esc(r.tendency) + '</div>' +
        '<div class="dimrow-line"><em>城市实况</em>' + esc(r.reality) + '</div>' +
        '<div class="dimrow-verdict">' + esc(r.verdict) + '</div></div>';
    }).join('');

    document.getElementById('portrait').textContent = d.portrait.text;
    var chips = d.portrait.top.map(function (t) {
      return '<span class="chip-on">' + esc(t.name) + ' ' + t.score + '</span>';
    }).concat(d.portrait.low.map(function (t) {
      return '<span class="chip-off">' + esc(t.name) + ' ' + t.score + '</span>';
    }));
    document.getElementById('chips').innerHTML = chips.join('');

    document.getElementById('secondary').innerHTML = d.secondary.map(function (s) {
      return '<div class="alt-city"><div class="alt-city-head"><b>' + esc(s.city) + '</b>' +
        '<span class="alt-pct">' + s.pct + '%</span></div>' +
        '<div class="alt-conc">' + esc(s.conclusion) + '</div>' +
        '<div class="alt-why">' + esc(s.reason) + '</div></div>';
    }).join('');

    document.getElementById('costs').innerHTML = d.tradeoffs.map(function (t) {
      return '<li>' + esc(t) + '</li>';
    }).join('');

    document.getElementById('reverseCity').textContent = d.reverse.city;
    document.getElementById('reversePct').textContent = d.reverse.pct + '%';
    document.getElementById('reverseWhy').textContent = d.reverse.why;
    document.getElementById('alternatives').innerHTML = d.reverse.alternatives.map(function (a) {
      return '<div class="alt-item"><b>' + esc(a.city) + ' ' + a.pct + '%</b><span>' + esc(a.why) + '</span></div>';
    }).join('');

    document.getElementById('theory').innerHTML = d.theoryPanel.map(function (t) {
      return '<div class="theory-item"><b>' + esc(t.title) + '</b><p>' + esc(t.text) + '</p></div>';
    }).join('');
    document.getElementById('boundary').innerHTML = d.boundary.map(function (t) {
      return '<li>' + esc(t) + '</li>';
    }).join('');
    document.getElementById('disclaimer').textContent =
      '匹配度是你的十维剖面与城市供给的接近程度，是刻度不是概率；十个维度独立计分，不用高分抵消错位。' +
      '城市数据为方向性整理，气候、房租与商业会随区域和时间波动，结果不构成迁移或购房建议。';

    if (window.Radar) window.Radar.draw(document.getElementById('radar'), d.portrait.vector);

    show(content);
  }

  function bindActions(d) {
    var shareUrl = CF.shareLink(id);
    var saveBtn = document.getElementById('save');
    var copyBtn = document.getElementById('copy');

    saveBtn.addEventListener('click', function () {
      if (!window.ShareCard) return;
      saveBtn.disabled = true;
      saveBtn.textContent = '正在生成长图…';
      setTimeout(function () {
        try {
          var canvas = window.ShareCard.build(d, shareUrl);
          window.ShareCard.save(canvas, '城市匹配-' + d.cityName + '.png');
        } catch (e) {
          console.error(e);
          toast('长图生成失败，请重试');
        }
        saveBtn.disabled = false;
        saveBtn.textContent = '保存长图';
      }, 30);
    });

    copyBtn.addEventListener('click', function () {
      function done() { toast('链接已复制'); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareUrl).then(done).catch(fallback);
      } else {
        fallback();
      }
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = shareUrl;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { toast(shareUrl); }
        ta.remove();
      }
    });

    document.getElementById('retake').addEventListener('click', function () {
      modal.classList.add('show');
    });
    document.getElementById('modalOk').addEventListener('click', function () {
      location.href = CF.page('index.html');
    });
    document.getElementById('modalCancel').addEventListener('click', function () {
      modal.classList.remove('show');
    });

    var viewer = document.getElementById('viewer');
    document.getElementById('viewerClose').addEventListener('click', function () {
      viewer.classList.remove('show');
      document.body.style.overflow = '';
    });
  }

  function boot() {
    if (!id) { fail('链接里没有结果编号。'); return; }
    if (!CF.ready) { fail(CF.message()); return; }

    CF.client.rpc('get_result', { p_id: id }).then(function (res) {
      if (res.error) throw res.error;
      var out = res.data || {};
      if (!out.ok || !out.data) { fail(out.error || '结果不存在或链接已失效。'); return; }
      hide(loading);
      if (out.data.portrait) {
        render(out.data);
        bindActions(out.data);
      } else {
        renderLegacy(out.data);
        var copyBtn = document.getElementById('copy');
        if (copyBtn) {
          copyBtn.addEventListener('click', function () {
            if (navigator.clipboard) navigator.clipboard.writeText(CF.shareLink(id));
          });
        }
      }
    }).catch(function (e) {
      fail(CF.message(e));
    });
  }

  boot();
})();
