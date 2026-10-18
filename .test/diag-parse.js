/** 诊断：为什么只解析出 13 条（页面应有 ~25 条） */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, process.argv[2] || 'sample-trending-daily.html');
const html = fs.readFileSync(file, 'utf8');

const exact = html.split('<article class="Box-row"').length - 1;
const loose = (html.match(/<article[^>]*class="[^"]*Box-row[^"]*"/g) || []).length;
console.log('精确 split 数:', exact);
console.log('宽松正则数 :', loose);

const tagRe = /<article[^>]*class="[^"]*Box-row[^"]*"[^>]*>/g;
const tags = new Set();
let m;
while ((m = tagRe.exec(html))) tags.add(m[0]);
console.log('\n出现的 article 标签写法:');
[...tags].forEach((t) => console.log('  ' + t));

// 逐个 chunk 试解析，打印失败的块特征
const chunks = html.split('<article class="Box-row"');
console.log('\nchunk 总数:', chunks.length - 1);
let ok = 0;
const fails = [];
for (let i = 1; i < chunks.length; i++) {
  const b = chunks[i];
  const h2 = b.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
  let reason = '';
  let name = '';
  if (!h2) {
    reason = '没有 h2';
  } else {
    const href = h2[1].match(/href="\/([^"?#]+)"/);
    if (!href) {
      reason = 'h2 里没有 href';
    } else {
      const seg = href[1].split('/');
      if (seg.length !== 2 || !seg[0] || !seg[1]) {
        reason = 'href 不是 owner/repo: ' + href[1];
      } else {
        name = href[1];
      }
    }
  }
  if (reason) {
    fails.push({ i, reason, head: b.slice(0, 260).replace(/\s+/g, ' ') });
  } else {
    ok++;
  }
}

console.log('解析成功:', ok, '｜ 失败:', fails.length);
fails.forEach((f) => {
  console.log('\n--- chunk #' + f.i + ' 失败原因: ' + f.reason);
  console.log('    ' + f.head);
});

// 统计 h2 的结构样本
console.log('\n=== h2 结构样本（前 3 个）===');
for (let i = 1; i <= Math.min(3, chunks.length - 1); i++) {
  const h2 = chunks[i].match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
  if (h2) console.log('\n[' + i + '] ' + h2[1].slice(0, 400).replace(/\s+/g, ' '));
}
