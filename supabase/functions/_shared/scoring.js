// 十维计分与结果生成。只在 Supabase Edge Function 内运行，前端拿不到分值与城市坐标。
import { MODEL } from "./model.js";

const { DIMS, DIM_INFO, QUESTIONS, CITIES, SITUATIONS, THEORY_PANEL, BOUNDARY } = MODEL;
const MAX_PER_DIM = 15;

const VERDICT = {
  PACE: {
    fit_high: "节奏对得上，你不用刻意调快或调慢。",
    fit_low: "你本来就不怕快，这里的紧你扛得住。",
    need: "你会觉得这里太赶，得自己划出下班后的时间。",
    exceed: "这里比你要的还慢，日子会松，但办事也慢。",
    both_low: "这里节奏偏快，你也不算抗拒，勉强能对上。",
  },
  FOOD: {
    fit_high: "吃的选择够你换着来，日常不会腻。",
    fit_low: "你对吃要求不高，这里够用。",
    need: "你想吃的这里给不全，得降低预期或自己找。",
    exceed: "这里的餐饮密度超过你的日常需求，算是余量。",
    both_low: "吃的选择一般，你也不太挑，不冲突。",
  },
  CULT: {
    fit_high: "博物馆和老街就在日常半径里，周末不用规划。",
    fit_low: "你对这些不执着，城市年轻也不影响你。",
    need: "你想看的这里不够，得出城或接受线上看展。",
    exceed: "文化供给比你要的多，逛不完但不会打扰你。",
    both_low: "文化资源偏少，你也不去，彼此不亏。",
  },
  TECH: {
    fit_high: "办事效率和新东西的密度都合你的习惯。",
    fit_low: "你不需要新东西，这里慢一点也无所谓。",
    need: "这里的效率跟不上你，很多事要人工跑。",
    exceed: "科技感超过你的需要，方便但可能有点冷。",
    both_low: "这里新东西不多，你也无感，问题不大。",
  },
  NAT: {
    fit_high: "山或水在通勤范围内，出门就能换气。",
    fit_low: "你待在室内为主，这里的景观够用。",
    need: "山水离你太远，周末要花半天在路上。",
    exceed: "自然资源比你要的多，周末不去也不亏。",
    both_low: "这里自然景观一般，你也不常去，能接受。",
  },
  NIGHT: {
    fit_high: "晚上十点后城市还醒着，你的作息不用改。",
    fit_low: "你睡得早，这里收摊早正好。",
    need: "你想出门的时候，这里已经安静了。",
    exceed: "夜生活比你要的热闹，怕吵的话要挑片区。",
    both_low: "夜里没什么可去，你也不出门，互不打扰。",
  },
  SHOP: {
    fit_high: "品牌和商场密度对得上你的逛街习惯。",
    fit_low: "你买得少，这里的商业够日常。",
    need: "你想买的东西这里不一定有，得靠网购。",
    exceed: "商业比你要的发达，逛的选择多，花钱也快。",
    both_low: "商业一般，你也不逛，不影响生活。",
  },
  CLIM: {
    fit_high: "气候体感合你，冬天不用硬扛。",
    fit_low: "你受得了冷，这里的冬天不算障碍。",
    need: "这里比你想要的更冷或更干，冬天会难熬。",
    exceed: "这里比你需要的更暖湿，夏天要适应。",
    both_low: "这里偏冷，你也不怕冷，能过。",
  },
  COST: {
    fit_high: "房租和日常开销都在你能接受的范围内。",
    fit_low: "你愿意为地段多付，这里的价格你扛得住。",
    need: "这里比你预期的贵，房租会吃掉一部分生活。",
    exceed: "这里比你需要的更便宜，能存下钱。",
    both_low: "这里不便宜，你也不太计较，压力自己扛。",
  },
  GREEN: {
    fit_high: "树荫、公园和绿道是日常，不是周末项目。",
    fit_low: "你不太在意绿地，这里够用。",
    need: "绿地和公园比你要的少，散步要挑地方。",
    exceed: "绿化超过你的需求，算是白送的。",
    both_low: "绿地偏少，你也不去，不算损失。",
  },
};

const GROUPS = [
  ["节奏与成本", ["PACE", "COST"], "先说每天的时间感和开销。"],
  ["吃、逛与夜晚", ["FOOD", "SHOP", "NIGHT"], "再看日常的消费与夜晚。"],
  ["文化、自然与绿地", ["CULT", "NAT", "GREEN"], "然后是能走能看的部分。"],
  ["科技与气候", ["TECH", "CLIM"], "最后是效率与体感。"],
];

const DIRECTION = {
  PACE: ["这里比你想要的更快", "这里比你要的更慢"],
  CLIM: ["这里比你想要的更冷", "这里比你要的更暖湿"],
  COST: ["这里比你想要的更贵", "这里比你能接受的更便宜"],
  NIGHT: ["这里比你想要的更安静", "这里比你要的更热闹"],
};

// 与 Python round() 对齐：.5 时取偶数，避免两侧结果在小数点上分叉。
function pyRound(x) {
  const f = Math.floor(x);
  const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

function tone(user, city) {
  const gap = Math.abs(user - city);
  if (gap <= 15) return Math.max(user, city) >= 60 ? "fit_high" : "fit_low";
  if (user < 45 && city < 45) return "both_low";
  return user > city ? "need" : "exceed";
}

function label(gap) {
  if (gap <= 15) return "合拍";
  if (gap <= 30) return "基本合拍";
  if (gap <= 45) return "需要适应";
  return "明显错位";
}

function closeness(user, city) {
  return Math.max(0, 1 - Math.abs(user - city) / 100);
}

export function scoreUser(answers) {
  const raw = {};
  DIMS.forEach((d) => { raw[d] = 0; });
  QUESTIONS.forEach((q) => {
    const key = answers[q.id];
    const opt = q.options.find((o) => o.key === key);
    if (opt) raw[q.dim] += opt.score;
  });
  const out = {};
  DIMS.forEach((d) => { out[d] = pyRound(raw[d] / MAX_PER_DIM * 100); });
  return out;
}

function similarity(user, vec) {
  let num = 0;
  DIMS.forEach((d) => { num += closeness(user[d], vec[d]); });
  const base = num / DIMS.length;
  const gaps = DIMS.map((d) => Math.abs(user[d] - vec[d]));
  const severe = gaps.filter((g) => g >= 50);
  const penalty = 0.012 * severe.length + 0.001 * severe.reduce((s, g) => s + g - 50, 0);
  return Math.max(0.30, base - penalty);
}

function displayPct(sim, gaps) {
  let pct = 20 + sim * 82;
  const topGap = gaps.length ? Math.max.apply(null, gaps) : 0;
  if (topGap >= 60) pct = Math.min(pct, 70);
  else if (topGap >= 45) pct = Math.min(pct, 84);
  return pyRound(Math.max(25, Math.min(96, pct)));
}

export function matchAll(user) {
  const rows = CITIES.map((city) => {
    const cv = vec(city);
    const sim = similarity(user, cv);
    const gaps = DIMS.map((d) => Math.abs(user[d] - cv[d]));
    return { city, sim, pct: displayPct(sim, gaps) };
  });
  rows.sort((a, b) => (b.pct - a.pct) || (b.sim - a.sim));
  let prev = 101;
  rows.forEach((r) => {
    if (r.pct >= prev) r.pct = prev - 1;
    prev = r.pct;
  });
  return rows;
}

function vec(city) {
  const out = {};
  DIMS.forEach((d, i) => { out[d] = city.vector[i]; });
  return out;
}

function facts(city) {
  const out = {};
  DIMS.forEach((d, i) => { out[d] = city.facts[i]; });
  return out;
}

function dimRows(user, city) {
  const cv = vec(city);
  const cf = facts(city);
  return DIMS.map((d) => {
    const u = user[d];
    const c = cv[d];
    const gap = Math.abs(u - c);
    return {
      key: d,
      name: DIM_INFO[d].name,
      score: u,
      cityScore: c,
      gap,
      label: label(gap),
      aligned: gap <= 30,
      tendency: u >= 50 ? DIM_INFO[d].high : DIM_INFO[d].low,
      reality: cf[d],
      verdict: VERDICT[d][tone(u, c)],
    };
  });
}

function reasons(user, city) {
  const cv = vec(city);
  const cf = facts(city);
  return GROUPS.map((g) => {
    const parts = [g[2]];
    g[1].forEach((d) => {
      parts.push(DIM_INFO[d].name + "：" + cf[d] + "。" + VERDICT[d][tone(user[d], cv[d])]);
    });
    return { title: g[0], text: parts.join(""), dims: g[1] };
  });
}

function portraitText(user) {
  const byHigh = DIMS.slice().sort((a, b) => user[b] - user[a]);
  const byLow = DIMS.slice().sort((a, b) => user[a] - user[b]);
  let top = byHigh.filter((d) => user[d] >= 60).slice(0, 3);
  const low = byLow.filter((d) => user[d] <= 40).slice(0, 2);
  if (!top.length) top = byHigh.slice(0, 2);
  let text = "你要的是" + top.map((d) => DIM_INFO[d].portrait).join("、");
  if (low.length) text += "；能接受" + low.map((d) => DIM_INFO[d].portrait_low).join("、");
  text += "。这不是旅行偏好，是你打算长期住下去时，最先受不了和最先离不开的部分。";
  return { text, top, low };
}

function compareReason(city, mainCity) {
  const cv = vec(city);
  const mv = vec(mainCity);
  const diffs = DIMS.map((d) => [d, cv[d] - mv[d]]).sort((a, b) => b[1] - a[1]);
  const strong = diffs.filter((x) => x[1] >= 5).slice(0, 2).map((x) => x[0]);
  const weak = diffs.slice().reverse().filter((x) => x[1] <= -5).slice(0, 1).map((x) => x[0]);
  const bits = [];
  if (strong.length) bits.push(strong.map((d) => DIM_INFO[d].more).join("、"));
  if (weak.length) bits.push("但" + DIM_INFO[weak[0]].less);
  if (!bits.length) return "整体供给和" + mainCity.name + "接近，差别在于城市规模与具体片区。";
  if (bits.length === 1 && strong.length) {
    return "和" + mainCity.name + "相比，" + bits[0] + "；其余维度接近。";
  }
  return "和" + mainCity.name + "相比，" + bits.join("，") + "。";
}

function conflictNote(d, diff) {
  if (DIRECTION[d]) return DIRECTION[d][diff > 0 ? 0 : 1];
  return diff > 0 ? "这里比你想要的少" : "这里比你要的多";
}

function reverse(user, ranked, main, secondary) {
  const used = new Set([main.city.key].concat(secondary.map((s) => {
    const hit = CITIES.find((c) => c.name === s.city);
    return hit ? hit.key : "";
  })));
  let worst = ranked[ranked.length - 1];
  for (let i = ranked.length - 1; i >= 0; i -= 1) {
    if (!used.has(ranked[i].city.key)) { worst = ranked[i]; break; }
  }
  const cv = vec(worst.city);
  const cf = facts(worst.city);
  const conflicts = DIMS
    .filter((d) => Math.abs(user[d] - cv[d]) >= 30)
    .map((d) => [d, user[d] - cv[d], cf[d]])
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 2);
  let why = conflicts.map((x) => DIM_INFO[x[0]].name + "：" + x[2] + "（" + conflictNote(x[0], x[1]) + "）").join("");
  if (!why) why = "十维整体都差着一截，不是某一项的问题。";
  const alts = [];
  ranked.forEach((r) => {
    if (alts.length >= 2) return;
    if (used.has(r.city.key) || r.city.key === worst.city.key) return;
    alts.push({ city: r.city.name, pct: r.pct, why: compareReason(r.city, worst.city) });
  });
  return { city: worst.city.name, pct: worst.pct, why, alternatives: alts };
}

function situation(user) {
  for (const s of SITUATIONS) {
    let ok = true;
    Object.keys(s.cond).forEach((d) => {
      const [lo, hi] = s.cond[d];
      if (!(lo <= user[d] && user[d] <= hi)) ok = false;
    });
    if (ok) return s.text;
  }
  return SITUATIONS[SITUATIONS.length - 1].text;
}

export function validateAnswers(answers) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return { ok: false, error: "答案格式不正确" };
  }
  for (let i = 0; i < QUESTIONS.length; i += 1) {
    const q = QUESTIONS[i];
    if (!(q.id in answers)) return { ok: false, error: "还有题目没有作答（第 " + (i + 1) + " 题）" };
    if (!q.options.some((o) => o.key === answers[q.id])) {
      return { ok: false, error: "答案选项不合法（第 " + (i + 1) + " 题）" };
    }
  }
  return { ok: true, error: "" };
}

export function pickResult(answers) {
  const user = scoreUser(answers);
  const ranked = matchAll(user);
  const main = ranked[0];
  const city = main.city;

  const secondary = ranked.slice(1, 4).map((r) => ({
    city: r.city.name,
    pct: r.pct,
    conclusion: r.city.conclusion,
    reason: compareReason(r.city, city),
  }));

  const p = portraitText(user);
  return {
    pct: main.pct,
    cityName: city.name,
    cityKey: city.key,
    conclusion: city.conclusion,
    situation: situation(user),
    portrait: {
      text: p.text,
      vector: user,
      top: p.top.map((d) => ({ name: DIM_INFO[d].name, score: user[d] })),
      low: p.low.map((d) => ({ name: DIM_INFO[d].name, score: user[d] })),
    },
    vector: user,
    dimRows: dimRows(user, city),
    reasons: reasons(user, city),
    tradeoffs: city.costs,
    secondary,
    reverse: reverse(user, ranked, main, secondary),
    theoryPanel: THEORY_PANEL,
    boundary: BOUNDARY,
    matchNote: "十维等权独立计分，任一维差距 ≥45 会单独扣分并压低匹配度上限，不用其他维度的高分抵消。",
    version: 3,
  };
}
