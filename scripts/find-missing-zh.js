/**
 * 列出「当前榜单里还没有中文说明」的仓库，方便快速补 data/zh.js
 * 用法：node scripts/find-missing-zh.js
 */
const path = require('path');

global.window = {};
require(path.join(__dirname, '..', 'web', 'data', 'trending.js'));

const ZH = require(path.join(__dirname, '..', 'data', 'zh.js'));
const T = global.window.TRENDING;

const seen = {};
const rows = [];
['daily', 'weekly', 'monthly'].forEach((p) => {
  (T.periods[p] || []).forEach((it) => {
    if (seen[it.id]) return;
    seen[it.id] = 1;
    rows.push(it);
  });
});

const missing = rows.filter((r) => !ZH[r.id]);
const unknownLang = rows.filter((r) => !r.language || r.language === 'Unknown');

console.log(
  '榜单唯一仓库 ' + rows.length +
  ' ｜ 已有中文 ' + (rows.length - missing.length) +
  ' ｜ 缺 ' + missing.length +
  ' ｜ 语言未识别 ' + unknownLang.length
);

if (missing.length) {
  console.log('\n【缺中文的仓库】（把下面这段贴进 data/zh.js，再补中文即可）\n');
  missing.forEach((it) => {
    console.log('  ' + JSON.stringify(it.id) + ': {');
    console.log('    purpose: \'\', // TODO 一句话中文用途（≤ 40 字）');
    console.log('    detail: \'\'   // TODO 2~4 句说明：给谁用、解决什么、怎么用');
    console.log('  },');
    console.log('  // ↑ ' + it.fullName + ' [' + it.language + '] ★' + it.stars);
    console.log('  //   EN: ' + (it.descEn || '(仓库没有填写描述)'));
    console.log('');
  });
}

if (unknownLang.length) {
  console.log('【语言未识别】（解析器兜底失败，值得查一眼）');
  unknownLang.forEach((it) => console.log('  ' + it.fullName));
  console.log('');
}

if (!missing.length) console.log('\n✅ 当前榜单的中文说明已全覆盖');
