(function () {
  var cfg = window.CF_CONFIG || {};
  var ready = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  var client = null;
  if (ready && window.supabase) {
    client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
  }

  // 用 cloud.js 自身的地址推导站点根，兼容 GitHub Pages 的 /repo/ 子路径。
  var script = document.currentScript || document.querySelector('script[src*="cloud.js"]');
  var base = script && script.src
    ? script.src.replace(/assets\/cloud\.js.*$/, '')
    : location.origin + '/';

  function page(name) { return base + name; }
  function shareLink(id) { return base + 'r/' + encodeURIComponent(id); }
  function resultPage(id) { return base + 'result.html?r=' + encodeURIComponent(id); }

  function message(err) {
    if (!ready) return '站点还没有配置 Supabase，请先在 config.js 填入 URL 和 anon key。';
    if (!err) return '网络不稳定，请重试。';
    var text = err.message || String(err);
    if (/Failed to fetch|NetworkError|fetch/i.test(text)) return '连不上 Supabase，请检查网络后重试。';
    if (/JWT|apikey|Invalid API key/i.test(text)) return 'Supabase 配置不正确，请检查 URL 与 anon key。';
    return text;
  }

  window.CF = {
    cfg: cfg,
    ready: ready,
    client: client,
    base: base,
    page: page,
    shareLink: shareLink,
    resultPage: resultPage,
    message: message
  };
})();
