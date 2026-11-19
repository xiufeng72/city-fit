(function () {
  var W = 750, PAD = 48, CW = W - PAD * 2;
  var BODY = '400 25px "PingFang SC","Microsoft YaHei",sans-serif';
  var BODY_LH = 42;
  var TITLE_F = '800 32px "PingFang SC","Microsoft YaHei",sans-serif';
  var SMALL = '400 22px "PingFang SC","Microsoft YaHei",sans-serif';
  var SMALL_LH = 36;
  var MUTED = '#63736D';

  var CLOSING = '，。、；：！？）》」』”’%,.!?:;)]}';
  function isClosing(ch) { return CLOSING.indexOf(ch) >= 0; }

  // 数字（含 2500–3500、35% 这类）整体不拆行，避免出现 "35 / 00" 的断法。
  function tokenize(text) {
    var out = [], buf = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (/[0-9]/.test(ch)) { buf += ch; continue; }
      if (buf) {
        if (/[.,:%+\-–~\/]/.test(ch)) { buf += ch; continue; }
        out.push(buf); buf = '';
      }
      out.push(ch);
    }
    if (buf) out.push(buf);
    return out;
  }

  function splitLong(ctx, token, maxW, lines) {
    var line = '';
    for (var i = 0; i < token.length; i++) {
      var t = line + token[i];
      if (line && ctx.measureText(t).width > maxW) { lines.push(line); line = token[i]; }
      else line = t;
    }
    return line;
  }

  function wrap(ctx, text, font, maxW) {
    ctx.font = font;
    var lines = [], line = '';
    var tk = tokenize(text || '');
    for (var i = 0; i < tk.length; i++) {
      var t = tk[i];
      if (t === '\n') { lines.push(line); line = ''; continue; }
      if (line && ctx.measureText(line + t).width > maxW) {
        if (isClosing(t)) { line += t; continue; }
        lines.push(line); line = '';
      }
      if (ctx.measureText(line + t).width > maxW && !line) {
        line = splitLong(ctx, t, maxW, lines);
      } else {
        line += t;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function Builder(ctx) {
    this.ctx = ctx;
    this.ops = [];
    this.y = 0;
  }
  Builder.prototype.gap = function (n) { this.y += n; };

  Builder.prototype.title = function (text) {
    this.y += 8;
    this.ops.push({ type: 'bar', x: PAD, y: this.y + 7, h: 26 });
    this.ops.push({ type: 'text', lines: [text], x: PAD + 18, y: this.y, font: TITLE_F, color: '#123B33', lh: 40 });
    this.y += 46;
  };

  // 分块标题：编号 + 标题 + 右侧小注，浅色底带，充当长图里的“页”。
  Builder.prototype.section = function (num, title, kicker) {
    this.y += 26;
    var nf = '900 42px "PingFang SC","Microsoft YaHei",sans-serif';
    this.ctx.font = nf;
    var nw = this.ctx.measureText(num).width;
    this.ops.push({ type: 'band', x: PAD - 18, y: this.y, w: CW + 36, h: 100 });
    this.ops.push({ type: 'text', lines: [num], x: PAD, y: this.y + 26, font: nf, color: '#9CCDBF', lh: 50 });
    this.ops.push({ type: 'text', lines: [title], x: PAD + nw + 18, y: this.y + 27, font: '800 33px "PingFang SC","Microsoft YaHei",sans-serif', color: '#123B33', lh: 44 });
    if (kicker) {
      this.ops.push({ type: 'text', lines: [kicker], x: W - PAD, y: this.y + 38, font: '600 20px "PingFang SC","Microsoft YaHei",sans-serif', color: '#8AA199', lh: 26, align: 'right' });
    }
    this.y += 100 + 24;
  };

  Builder.prototype.body = function (text, gapAfter) {
    var lines = wrap(this.ctx, text, BODY, CW);
    this.ops.push({ type: 'text', lines: lines, x: PAD, y: this.y, font: BODY, color: '#3C4B46', lh: BODY_LH });
    this.y += lines.length * BODY_LH + (gapAfter || 0);
  };

  Builder.prototype.note = function (text, gapAfter) {
    var lines = wrap(this.ctx, text, SMALL, CW);
    this.ops.push({ type: 'text', lines: lines, x: PAD, y: this.y, font: SMALL, color: MUTED, lh: SMALL_LH });
    this.y += lines.length * SMALL_LH + (gapAfter || 0);
  };

  Builder.prototype.bullets = function (items, gapAfter) {
    var self = this;
    items.forEach(function (it) {
      var lines = wrap(self.ctx, it, '400 24px "PingFang SC","Microsoft YaHei",sans-serif', CW - 28);
      self.ops.push({ type: 'dot', x: PAD + 4, y: self.y + 18 });
      self.ops.push({ type: 'text', lines: lines, x: PAD + 24, y: self.y, font: '400 24px "PingFang SC","Microsoft YaHei",sans-serif', color: '#3C4B46', lh: 40 });
      self.y += lines.length * 40 + 12;
    });
    this.y += (gapAfter || 0);
  };

  // 匹配理由：小标题 + 正文，四个分组各一块。
  Builder.prototype.reason = function (item, gapAfter) {
    var RF = '700 27px "PingFang SC","Microsoft YaHei",sans-serif';
    this.ops.push({ type: 'text', lines: [item.title], x: PAD, y: this.y, font: RF, color: '#2F7D68', lh: 38 });
    this.y += 40;
    var lines = wrap(this.ctx, item.text, '400 24px "PingFang SC","Microsoft YaHei",sans-serif', CW - 6);
    this.ops.push({ type: 'text', lines: lines, x: PAD, y: this.y, font: '400 24px "PingFang SC","Microsoft YaHei",sans-serif', color: '#3C4B46', lh: 40 });
    this.y += lines.length * 40 + (gapAfter || 0);
  };

  // 十维对照：维度名 / 右侧刻度 / 一行判定。
  Builder.prototype.dims = function (rows) {
    var self = this;
    var NAME_F = '700 24px "PingFang SC","Microsoft YaHei",sans-serif';
    var TAG_F = '500 20px "PingFang SC","Microsoft YaHei",sans-serif';
    rows.forEach(function (r) {
      var tag = r.label + '　你 ' + r.score + ' / 城市 ' + r.cityScore;
      self.ops.push({ type: 'text', lines: [r.name], x: PAD, y: self.y, font: NAME_F, color: '#123B33', lh: 34 });
      self.ops.push({ type: 'text', lines: [tag], x: W - PAD, y: self.y + 4, font: TAG_F, color: r.aligned ? '#2F7D68' : '#A8681B', lh: 30, align: 'right' });
      self.y += 34;
      var lines = wrap(self.ctx, r.verdict, '400 21px "PingFang SC","Microsoft YaHei",sans-serif', CW - 8);
      self.ops.push({ type: 'text', lines: lines, x: PAD, y: self.y + 2, font: '400 21px "PingFang SC","Microsoft YaHei",sans-serif', color: MUTED, lh: 33 });
      self.y += lines.length * 33 + 14;
    });
  };

  // 画像标签：强项用实色，弱项用描边浅色。
  Builder.prototype.chips = function (items) {
    var CF = '600 21px "PingFang SC","Microsoft YaHei",sans-serif';
    var x = PAD, y = this.y, rowH = 42, gapX = 10, gapY = 10;
    var self = this;
    items.forEach(function (it) {
      self.ctx.font = CF;
      var w = self.ctx.measureText(it.text).width + 30;
      if (x + w > W - PAD) { x = PAD; y += rowH + gapY; }
      self.ops.push({ type: 'pill', x: x, y: y, w: w, h: 38, text: it.text, strong: it.strong });
      x += w + gapX;
    });
    this.y = y + rowH + 4;
  };

  // 其他城市卡片：城市名 + 匹配度 + 结论 + 差异理由。
  Builder.prototype.alt = function (s, gapAfter) {
    var headF = '800 30px "PingFang SC","Microsoft YaHei",sans-serif';
    var concF = '400 21px "PingFang SC","Microsoft YaHei",sans-serif';
    var whyF = '400 22px "PingFang SC","Microsoft YaHei",sans-serif';
    var conc = wrap(this.ctx, s.conclusion, concF, CW - 40);
    var why = wrap(this.ctx, s.reason, whyF, CW - 40);
    var h = 24 + 42 + conc.length * 32 + 10 + why.length * 35 + 22;
    this.ops.push({ type: 'card', x: PAD, y: this.y, w: CW, h: h });
    var inner = PAD + 20;
    this.ops.push({ type: 'text', lines: [s.city], x: inner, y: this.y + 22, font: headF, color: '#123B33', lh: 42 });
    this.ops.push({ type: 'text', lines: [s.pct + '%'], x: W - PAD - 20, y: this.y + 24, font: '800 28px "PingFang SC","Microsoft YaHei",sans-serif', color: '#2F7D68', lh: 38, align: 'right' });
    var cy = this.y + 22 + 42;
    this.ops.push({ type: 'text', lines: conc, x: inner, y: cy, font: concF, color: MUTED, lh: 32 });
    var wy = cy + conc.length * 32 + 10;
    this.ops.push({ type: 'text', lines: why, x: inner, y: wy, font: whyF, color: '#3C4B46', lh: 35 });
    this.y += h + (gapAfter || 0);
  };

  Builder.prototype.kv = function (label, value) {
    this.ops.push({ type: 'text', lines: [label], x: PAD, y: this.y, font: '700 24px "PingFang SC","Microsoft YaHei",sans-serif', color: '#2F7D68', lh: 36 });
    this.y += 36;
    var lines = wrap(this.ctx, value, BODY, CW);
    this.ops.push({ type: 'text', lines: lines, x: PAD, y: this.y, font: BODY, color: '#3C4B46', lh: BODY_LH });
    this.y += lines.length * BODY_LH + 12;
  };

  Builder.prototype.rule = function () {
    this.ops.push({ type: 'line', x1: PAD, y1: this.y, x2: W - PAD, y2: this.y });
    this.y += 1 + 24;
  };

  function build(data, url) {
    var measure = document.createElement('canvas').getContext('2d');

    var conclLines = wrap(measure, data.conclusion, '600 30px "PingFang SC","Microsoft YaHei",sans-serif', CW);
    var sitLines = wrap(measure, data.situation, '400 24px "PingFang SC","Microsoft YaHei",sans-serif', CW);
    var headerH = 364 + conclLines.length * 44 + sitLines.length * 38;

    var b = new Builder(measure);
    b.y = headerH + 10;

    // 01 主结果：城市、匹配度、结论、逐组理由、代价
    b.section('01', '为什么是' + data.cityName, '主结果');
    b.note(data.matchNote || '', 16);
    data.reasons.forEach(function (r) { b.reason(r, 18); });
    if (data.tradeoffs && data.tradeoffs.length) {
      b.title('在这里要付的代价');
      b.bullets(data.tradeoffs, 8);
    }

    // 02 十维画像：文字画像 + 强/弱标签 + 十维对照
    b.section('02', '你的城市偏好画像', '十维');
    b.body(data.portrait.text, 16);
    var chips = [];
    data.portrait.top.forEach(function (t) { chips.push({ text: t.name + ' ' + t.score, strong: true }); });
    data.portrait.low.forEach(function (t) { chips.push({ text: t.name + ' ' + t.score, strong: false }); });
    b.chips(chips);
    b.gap(10);
    b.title('十维对照');
    b.dims(data.dimRows);

    // 03 其他适合你的城市：差异化理由 + 不合拍的一座
    b.section('03', '其他适合你的城市', '与主城市不同');
    data.secondary.forEach(function (s) { b.alt(s, 16); });
    if (data.reverse) {
      b.title('不太合拍的一座');
      b.ops.push({ type: 'text', lines: [data.reverse.city + '　' + data.reverse.pct + '%'], x: PAD, y: b.y, font: '800 28px "PingFang SC","Microsoft YaHei",sans-serif', color: '#A8681B', lh: 40 });
      b.y += 44;
      b.note(data.reverse.why, 12);
      data.reverse.alternatives.forEach(function (a) {
        var lines = wrap(measure, a.city + '：' + a.why, SMALL, CW - 20);
        b.ops.push({ type: 'text', lines: lines, x: PAD + 18, y: b.y, font: SMALL, color: MUTED, lh: SMALL_LH });
        b.y += lines.length * SMALL_LH + 10;
      });
    }

    b.gap(10);
    b.rule();

    var foot = '匹配度是你的十维剖面与城市供给的接近程度，是刻度不是概率；十个维度独立计分，不用高分抵消错位。' +
      '城市数据为方向性整理，气候、房租与商业会随区域和时间波动，结果不构成迁移或购房建议。';
    var fl = wrap(measure, foot, '400 20px "PingFang SC","Microsoft YaHei",sans-serif', CW);
    b.ops.push({ type: 'text', lines: fl, x: PAD, y: b.y, font: '400 20px "PingFang SC","Microsoft YaHei",sans-serif', color: '#9AA9A4', lh: 34 });
    b.y += fl.length * 34 + 14;
    b.ops.push({ type: 'text', lines: [url.replace(/^https?:\/\//, '')], x: PAD, y: b.y, font: '500 20px "PingFang SC","Microsoft YaHei",sans-serif', color: '#4E9B8A', lh: 30 });

    var totalH = Math.ceil(b.y + 54);

    // iOS Safari 对画布总像素有限制，超高时逐级降采样。
    var scale = 2;
    while (scale > 1 && W * totalH * scale * scale > 16000000) { scale -= 0.25; }

    var canvas = document.createElement('canvas');
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(totalH * scale);
    var ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, totalH);

    var g = ctx.createLinearGradient(0, 0, W * 0.7, headerH);
    g.addColorStop(0, '#0E3B33');
    g.addColorStop(0.6, '#145246');
    g.addColorStop(1, '#1F6B5A');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, headerH);

    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(W - 60, 110, 160, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(W - 230, headerH - 10, 80, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.font = '600 22px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('你适合哪座城市 · 生活适配', PAD, 66);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 96px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText(data.cityName, PAD - 4, 176);

    ctx.fillStyle = '#C9F0E4';
    ctx.font = '900 66px "PingFang SC","Microsoft YaHei",sans-serif';
    var pctText = data.pct + '%';
    ctx.fillText(pctText, PAD - 2, 252);
    var pctW = ctx.measureText(pctText).width;
    ctx.fillStyle = 'rgba(255,255,255,.66)';
    ctx.font = '600 24px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('匹配度', PAD - 2 + pctW + 16, 252);

    ctx.fillStyle = 'rgba(255,255,255,.94)';
    ctx.font = '600 30px "PingFang SC","Microsoft YaHei",sans-serif';
    conclLines.forEach(function (ln, i) {
      ctx.fillText(ln, PAD, 300 + i * 44);
    });

    var sitY = 300 + conclLines.length * 44 + 14;
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    ctx.font = '400 24px "PingFang SC","Microsoft YaHei",sans-serif';
    sitLines.forEach(function (ln, i) {
      ctx.fillText(ln, PAD, sitY + i * 38);
    });

    b.ops.forEach(function (op) {
      if (op.type === 'text') {
        ctx.font = op.font;
        ctx.fillStyle = op.color;
        ctx.textBaseline = 'top';
        ctx.textAlign = op.align || 'left';
        op.lines.forEach(function (ln, i) {
          ctx.fillText(ln, op.x, op.y + i * op.lh);
        });
        ctx.textAlign = 'left';
      } else if (op.type === 'band') {
        ctx.fillStyle = '#F1F9F6';
        rr(ctx, op.x, op.y, op.w, op.h, 18);
        ctx.fill();
        ctx.fillStyle = '#6FC0AD';
        rr(ctx, op.x, op.y, 5, op.h, 2.5);
        ctx.fill();
      } else if (op.type === 'card') {
        ctx.fillStyle = '#FAFDFC';
        rr(ctx, op.x, op.y, op.w, op.h, 16);
        ctx.fill();
        ctx.strokeStyle = '#E1EDE9';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (op.type === 'pill') {
        if (op.strong) {
          ctx.fillStyle = '#E4F5EF';
          rr(ctx, op.x, op.y, op.w, op.h, 19);
          ctx.fill();
          ctx.fillStyle = '#2F7D68';
        } else {
          ctx.fillStyle = '#FFFFFF';
          rr(ctx, op.x, op.y, op.w, op.h, 19);
          ctx.fill();
          ctx.strokeStyle = '#DCE8E4';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.fillStyle = '#8A9B95';
        }
        ctx.font = '600 21px "PingFang SC","Microsoft YaHei",sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(op.text, op.x + op.w / 2, op.y + op.h / 2 + 1);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
      } else if (op.type === 'bar') {
        ctx.fillStyle = '#4E9B8A';
        rr(ctx, op.x, op.y, 4, op.h, 2);
        ctx.fill();
      } else if (op.type === 'dot') {
        ctx.beginPath();
        ctx.arc(op.x, op.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#B9D3CB';
        ctx.fill();
      } else if (op.type === 'line') {
        ctx.beginPath();
        ctx.moveTo(op.x1, op.y1);
        ctx.lineTo(op.x2, op.y2);
        ctx.strokeStyle = '#E3EFEB';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    return canvas;
  }

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function isWeChat() { return /MicroMessenger/i.test(navigator.userAgent); }
  function isMobile() {
    return isWeChat() || isIOS() || /Android|Mobile|HarmonyOS/i.test(navigator.userAgent);
  }

  function tipText() {
    if (isWeChat()) {
      return '长按图片 → 保存图片。如果长按没有反应，点右上角「···」选「在浏览器打开」，再长按保存。';
    }
    if (isIOS()) return '长按图片 → 存储到照片。也可点下方「下载图片」。';
    return '长按图片 → 保存到相册。也可点下方「下载图片」。';
  }

  function showViewer(url, tip, opts) {
    opts = opts || {};
    var viewer = document.getElementById('viewer');
    var img = document.getElementById('viewerImg');
    var tipEl = document.getElementById('viewerTip');
    var actions = document.getElementById('viewerActions');
    tipEl.textContent = tip;
    img.src = url;
    if (actions) {
      actions.innerHTML = '';
      var canShareFile = false;
      if (opts.file && navigator.canShare) {
        try { canShareFile = navigator.canShare({ files: [opts.file] }); } catch (e) { canShareFile = false; }
      }
      if (canShareFile) {
        var shareBtn = document.createElement('button');
        shareBtn.className = 'btn';
        shareBtn.textContent = '分享图片';
        shareBtn.addEventListener('click', function () {
          navigator.share({ files: [opts.file], title: '城市匹配长图' }).catch(function () {});
        });
        actions.appendChild(shareBtn);
      }
      if (url) {
        var dl = document.createElement('a');
        dl.className = 'btn ghost';
        dl.href = url;
        dl.download = opts.filename || 'result.png';
        dl.textContent = '下载图片';
        actions.appendChild(dl);
      }
    }
    viewer.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function downloadCanvas(canvas, filename) {
    function viaDataUrl() {
      var a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    if (!canvas.toBlob) return viaDataUrl();
    canvas.toBlob(function (blob) {
      if (!blob) return viaDataUrl();
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 6000);
    }, 'image/png');
  }

  function save(canvas, filename) {
    // 桌面端维持直接下载
    if (!isMobile()) { downloadCanvas(canvas, filename); return; }

    // 移动端与微信：先弹全屏预览，长按保存到相册
    canvas.toBlob(function (blob) {
      if (!blob) {
        showViewer(canvas.toDataURL('image/png'), tipText(), { filename: filename });
        return;
      }
      var file = null;
      try { file = new File([blob], filename, { type: 'image/png' }); } catch (e) { file = null; }
      // 微信内置浏览器对 blob: 的长按支持不稳定，改用 data URL
      var url = isWeChat() ? canvas.toDataURL('image/png') : URL.createObjectURL(blob);
      showViewer(url, tipText(), { file: file, filename: filename });
    }, 'image/png');
  }

  window.ShareCard = { build: build, save: save, isIOS: isIOS, isWeChat: isWeChat, isMobile: isMobile };
})();
