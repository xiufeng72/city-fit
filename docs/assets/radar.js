(function () {
  var LABELS = [
    ['PACE', '生活节奏'], ['FOOD', '美食多元'], ['CULT', '文化历史'],
    ['TECH', '科技创新'], ['NAT', '自然环境'], ['NIGHT', '夜生活'],
    ['SHOP', '购物消费'], ['CLIM', '气候偏好'], ['COST', '居住成本'], ['GREEN', '城市绿化']
  ];

  window.drawRadar = function (canvas, vec) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    var cx = W / 2, cy = H / 2 + 4;
    var R = W * 0.29;
    var n = LABELS.length;

    function pt(i, r) {
      var a = -Math.PI / 2 + i * 2 * Math.PI / n;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    }

    // 网格
    for (var level = 1; level <= 4; level++) {
      var r = R * level / 4;
      ctx.beginPath();
      for (var i = 0; i < n; i++) {
        var p = pt(i, r);
        if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
      }
      ctx.closePath();
      ctx.strokeStyle = level === 4 ? '#D5E6E1' : '#E8F2EF';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 轴线
    for (var j = 0; j < n; j++) {
      var q = pt(j, R);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(q[0], q[1]);
      ctx.strokeStyle = '#E8F2EF';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 数据面
    ctx.beginPath();
    for (var k = 0; k < n; k++) {
      var v = Math.max(0, Math.min(100, vec[LABELS[k][0]] || 0));
      var pp = pt(k, R * v / 100);
      if (k === 0) ctx.moveTo(pp[0], pp[1]); else ctx.lineTo(pp[0], pp[1]);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(108,92,231,.16)';
    ctx.fill();
    ctx.strokeStyle = '#6C5CE7';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 顶点与标签
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var m = 0; m < n; m++) {
      var val = Math.round(vec[LABELS[m][0]] || 0);
      var vp = pt(m, R * val / 100);
      ctx.beginPath();
      ctx.arc(vp[0], vp[1], 6, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = '#6C5CE7';
      ctx.lineWidth = 3;
      ctx.stroke();

      var lp = pt(m, R + 30);
      var dx = lp[0] - cx;
      var dy = lp[1] - cy;
      if (Math.abs(dx) < 6) ctx.textAlign = 'center';
      else ctx.textAlign = dx > 0 ? 'left' : 'right';
      if (Math.abs(dy) < 10) ctx.textBaseline = 'middle';
      else ctx.textBaseline = dy > 0 ? 'top' : 'bottom';

      ctx.font = '600 20px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillStyle = '#3E5049';
      ctx.fillText(LABELS[m][1], lp[0], lp[1] - 8);
      ctx.font = '500 16px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillStyle = '#8B9C96';
      ctx.fillText(String(val), lp[0], lp[1] + 12);
    }
  };
})();
