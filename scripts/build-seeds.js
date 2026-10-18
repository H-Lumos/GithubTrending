/**
 * 从 miniprogram/data/mock.js 抽取人工撰写的中文文案，生成种子文件
 * 用法：node scripts/build-seeds.js
 * 产物：cloudfunctions/seedZh/seeds.json
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mock = require(path.join(root, 'miniprogram', 'data', 'mock.js'));

const seeds = mock.all().map((it) => ({
  fullName: it.fullName,
  purpose: it.purpose,
  detail: it.detail,
  tags: it.tags || []
}));

// 简单校验，防止把半成品写进云端
const bad = seeds.filter((s) => !s.fullName || !s.purpose || !s.detail);
if (bad.length) {
  console.error('以下条目不完整，已中止：');
  bad.forEach((b) => console.error('  ' + b.fullName));
  process.exit(1);
}

const outDir = path.join(root, 'cloudfunctions', 'seedZh');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'seeds.json');
fs.writeFileSync(outFile, JSON.stringify(seeds, null, 2), 'utf8');

console.log('已生成 ' + outFile);
console.log('条目数: ' + seeds.length);
console.log('示例:');
console.log(JSON.stringify(seeds[0], null, 2));
