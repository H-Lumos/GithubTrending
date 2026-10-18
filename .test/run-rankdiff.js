/**
 * computeRankDiff 单元测试（纯函数，无需网络）
 * 用法：node .test/run-rankdiff.js
 */
const path = require('path');
const model = require(path.join(__dirname, '..', 'cloudfunctions', 'getTrending', 'index.js'));
const diff = model.__computeRankDiff;

let pass = 0;
const fails = [];

function eq(name, actual, expect) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expect);
  if (a === e) {
    pass++;
    console.log('  ✓ ' + name);
  } else {
    fails.push(name + '\n      期望 ' + e + '\n      实际 ' + a);
    console.log('  ✗ ' + name + '  期望 ' + e + ' 实际 ' + a);
  }
}

const items = [
  { id: 'a/x', rank: 1 },
  { id: 'b/y', rank: 2 },
  { id: 'c/z', rank: 3 },
  { id: 'd/new', rank: 4 }
];

console.log('【无历史快照】');
let out = diff(null, items);
eq('全部 rankChange=null', out.map((o) => o.rankChange), [null, null, null, null]);
eq('全部 isNew=false（避免首屏全 NEW）', out.map((o) => o.isNew), [false, false, false, false]);

console.log('【有历史：上次顺序 a/x > c/z > b/y，b/y 升到第 2、c/z 掉到第 3、d/new 新上榜】');
out = diff(['a/x', 'c/z', 'b/y'], items);
eq('a/x 位置不变 rankChange=0', out[0].rankChange, 0);
eq('b/y 从第 3 升到第 2（+1）', out[1].rankChange, 1);
eq('c/z 从第 2 掉到第 3（-1）', out[2].rankChange, -1);
eq('d/new 是新上榜', out[3].isNew, true);
eq('d/new rankChange=null', out[3].rankChange, null);
eq('prevRank 记录上次名次', out.map((o) => o.prevRank), [1, 3, 2, null]);

console.log('【历史为空数组】');
out = diff([], items);
eq('空数组等同无历史', out.map((o) => o.isNew), [false, false, false, false]);

console.log('【items 为空】');
eq('空榜单返回空数组', diff(['a/x'], []).length, 0);

console.log('\n结果：' + pass + ' 通过 / ' + fails.length + ' 失败');
if (fails.length) {
  console.log(fails.join('\n'));
  process.exit(1);
}
