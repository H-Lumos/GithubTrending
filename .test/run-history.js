/**
 * 名次变化 / 走势的真实值单测（不联网、不写文件）
 * 用法：node .test/run-history.js
 */
const path = require('path');
const { rankDelta, trendOf, TREND_DAYS } = require(path.join(__dirname, '..', 'scripts', 'snapshot.js'));

let pass = 0;
const fails = [];
function eq(name, actual, expect) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expect);
  if (a === e) {
    pass++;
    console.log('  ✓ ' + name);
  } else {
    fails.push(name);
    console.log('  ✗ ' + name + '\n      期望 ' + e + '\n      实际 ' + a);
  }
}

/* ---------------- 名次变化 ---------------- */
console.log('【名次变化】');
const prev = { d: '2026-10-17', ranks: { daily: ['a/x', 'b/y', 'c/z', 'd/w'] } };

eq('原第 2 名升到第 1 名 → +1', rankDelta(prev, 'daily', 'b/y', 1), { rankChange: 1, isNew: false });
eq('原第 1 名掉到第 3 名 → -2', rankDelta(prev, 'daily', 'a/x', 3), { rankChange: -2, isNew: false });
eq('名次不变 → 0', rankDelta(prev, 'daily', 'c/z', 3), { rankChange: 0, isNew: false });
eq('新面孔 → isNew', rankDelta(prev, 'daily', 'e/new', 2), { rankChange: null, isNew: true });
eq('没有前一天 → 两者都无', rankDelta(null, 'daily', 'a/x', 1), { rankChange: null, isNew: false });
eq('前一天没有该周期 → 无数据', rankDelta({ d: '2026-10-17', ranks: {} }, 'weekly', 'a/x', 1), {
  rankChange: null,
  isNew: false
});

/* ---------------- 走势：只存真实值 ---------------- */
console.log('【走势只存真实记录】');
const todayStr = new Date().toISOString().slice(0, 10);
function dayAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

// 没有任何历史
const t0 = trendOf({ days: [] }, 'a/x', 1000);
eq('无历史 → 只有 1 个点（今天的真实值）', [t0.trend.length, t0.realPoints, t0.trend[0]], [1, 1, 1000]);

// 3 天历史
const hist3 = {
  days: [
    { d: dayAgo(2), stars: { 'a/x': 800 } },
    { d: dayAgo(1), stars: { 'a/x': 900 } }
  ]
};
const t3 = trendOf(hist3, 'a/x', 1000);
eq('2 天历史 + 今天 → 3 个真实点', [t3.trend.length, t3.realPoints], [3, 3]);
eq('数值顺序为时间正序', t3.trend, [800, 900, 1000]);

// 缺一天：不填充、不编造
const gap = {
  days: [
    { d: dayAgo(4), stars: { 'a/x': 500 } },
    { d: dayAgo(2), stars: { 'a/x': 700 } }
  ]
};
const tg = trendOf(gap, 'a/x', 750);
eq('有缺口时只保留有记录的天（不填充）', tg.trend, [500, 700, 750]);
eq('真实点数 = 实际记录数', tg.realPoints, 3);

// 今天已经跑过一次：不能重复记今天
const withToday = {
  days: [
    { d: dayAgo(1), stars: { 'a/x': 900 } },
    { d: todayStr, stars: { 'a/x': 999 } }
  ]
};
const tt = trendOf(withToday, 'a/x', 1000);
eq('同一天重复运行不会产生重复点', tt.trend, [900, 1000]);

// 超过 30 天：只留最近 30 个真实点
const many = { days: [] };
for (let i = 40; i >= 1; i--) {
  many.days.push({ d: dayAgo(i), stars: { 'a/x': 1000 + (40 - i) } });
}
const tm = trendOf(many, 'a/x', 9999);
eq('40 天历史 → 只保留最近 30 个点', [tm.trend.length, tm.realPoints], [TREND_DAYS, TREND_DAYS]);
eq('末点 = 当前值', tm.trend[29], 9999);

// 关键回归：不能再出现「回推撞 0」
const cliff = { days: [{ d: dayAgo(1), stars: { 'a/x': 51573 } }] };
const tc = trendOf(cliff, 'a/x', 53521);
eq('两天数据不会产出 0 值', tc.trend.some((v) => v === 0), false);
eq('两天数据只产出 2 个点', tc.trend, [51573, 53521]);

console.log('\n结果：' + pass + ' 通过 / ' + fails.length + ' 失败');
if (fails.length) {
  console.log('失败项：' + fails.join(', '));
  process.exit(1);
}
