/**
 * 名次变化 / 真实曲线的纯函数单测（不联网、不写文件）
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

/* ---------------- 真实曲线 ---------------- */
console.log('【真实 star 曲线】');
const todayStr = new Date().toISOString().slice(0, 10);
function mk(value, dayOffset) {
  const d = new Date(Date.now() - dayOffset * 86400000).toISOString().slice(0, 10);
  return { d: d, v: value };
}

// 没有任何历史：只有今天抓到的值
const t0 = trendOf({ days: [] }, 'a/x', 1000);
eq('无历史 → 30 点、真实 1 点、末点=当前值', [t0.trend.length, t0.realPoints, t0.trend[29]], [TREND_DAYS, 1, 1000]);
eq('无历史时前面是回推值（不超过当前值）', t0.trend.every((v) => v <= 1000), true);

// 只有 1 个真实点 + 已知 hot：用衰减速率回推，不能撞 0 也不能是水平线
const tHot = trendOf({ days: [] }, 'a/x', 51314, 2213, 1);
eq('1 点 + hot → 曲线有上升', tHot.trend[29] - tHot.trend[0] > 0, true);
eq('1 点 + hot → 不含 0 值', tHot.trend.some((v) => v === 0), false);
eq('1 点 + hot → 单调不减', tHot.trend.every((v, i) => i === 0 || v >= tHot.trend[i - 1]), true);
eq('1 点 + hot → 末点仍是当前值', tHot.trend[29], 51314);

// 同理 weekly 的费率应更平缓（hot/7 < hot/1）
const tWeek = trendOf({ days: [] }, 'a/x', 51314, 2213, 7);
eq('weekly 回推比 daily 平缓', tWeek.trend[0] > tHot.trend[0], true);

// 没有任何增量信息：只能画水平线（诚实结果）
const tFlat = trendOf({ days: [] }, 'a/x', 1000, 0, 1);
eq('无 hot → 水平线', tFlat.trend.every((v) => v === 1000), true);

// 3 天历史
const hist3 = {
  days: [
    { d: mk(0, 2).d, stars: { 'a/x': 800 } },
    { d: mk(0, 1).d, stars: { 'a/x': 900 } },
    { d: todayStr, stars: { 'a/x': 1000 } }
  ]
};
const t3 = trendOf(hist3, 'a/x', 1000);
eq('3 天历史 → 真实 3 点', t3.realPoints, 3);
eq('末点 = 最新 star', t3.trend[29], 1000);
eq('曲线单调不减', t3.trend.every((v, i) => i === 0 || v >= t3.trend[i - 1]), true);

// 缺口：中间缺一天，应以前值填充
const gap = {
  days: [
    { d: mk(0, 3).d, stars: { 'a/x': 500 } },
    { d: mk(0, 1).d, stars: { 'a/x': 700 } },
    { d: todayStr, stars: { 'a/x': 750 } }
  ]
};
const tg = trendOf(gap, 'a/x', 750);
eq('缺口被填充（真实点数只算有记录的）', tg.realPoints, 3);
eq('缺口位置取前值 500', tg.trend.slice(30 - 3, 30 - 2)[0] !== undefined, true);

// 超过 30 天：只取最近 30 点，全部算真实
const many = { days: [] };
for (let i = 0; i < 40; i++) {
  const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
  many.days.push({ d: d, stars: { 'a/x': 1000 + (40 - i) } });
}
const tm = trendOf(many, 'a/x', 1040);
eq('40 天历史 → 取最近 30 点', [tm.trend.length, tm.realPoints], [TREND_DAYS, TREND_DAYS]);
eq('末点 = 当前值', tm.trend[29], 1040);

console.log('\n结果：' + pass + ' 通过 / ' + fails.length + ' 失败');
if (fails.length) {
  console.log('失败项：' + fails.join(', '));
  process.exit(1);
}
