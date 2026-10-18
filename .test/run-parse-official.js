/**
 * parseOfficialTrending 单元测试（用 fixture，不联网）
 * 用法：node .test/run-parse-official.js
 */
const fs = require('fs');
const path = require('path');
const model = require(path.join(__dirname, '..', 'cloudfunctions', 'getTrending', 'index.js'));
const parse = model.__parseOfficial;

let pass = 0;
const fails = [];
function eq(name, actual, expect) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expect);
  if (a === e) {
    pass++;
    console.log('  ✓ ' + name);
  } else {
    fails.push(name + ' | 期望 ' + e + ' 实际 ' + a);
    console.log('  ✗ ' + name + '\n      期望 ' + e + '\n      实际 ' + a);
  }
}

const html = fs.readFileSync(path.join(__dirname, 'fixture-trending.html'), 'utf8');
const items = parse(html, 'daily');

console.log('【正常解析】');
eq('仓库数', items.length, 2);
eq('第 1 条 id', items[0].id, 'anthropics/claude-plugins-official');
eq('owner/repo 拆分', [items[0].owner, items[0].repo], ['anthropics', 'claude-plugins-official']);
eq('url', items[0].url, 'https://github.com/anthropics/claude-plugins-official');
eq(
  '描述（纯文本）',
  items[0].descEn,
  'Official, Anthropic-managed directory of high quality Claude Code Plugins.'
);
eq('语言', items[0].language, 'Python');
eq('语言色取自页面 style', items[0].languageColor, '#3572A5');
eq('stars（去逗号）', items[0].stars, 42115);
eq('forks（去逗号）', items[0].forks, 4492);
eq('stars today', items[0].hot, 1397);
eq('hotUnit 跟周期走', items[0].hotUnit, '今日新增');
eq('Built by 头像数', items[0].avatars.length, 2);
eq('dataSource=official', items[0].dataSource, 'official');
eq('rank 从 1 递增', items.map((i) => i.rank), [1, 2]);

console.log('【第 2 条：HTML 实体 + 另一种语言色】');
eq('&quot; / &amp; / &lt; 已解码', items[1].descEn, '"CLI-Anything: Making ALL Software Agent-Native" & more <docs>');
eq('语言', items[1].language, 'JavaScript');
eq('语言色', items[1].languageColor, '#f1e05a');
eq('stars', items[1].stars, 54247);
eq('stars today', items[1].hot, 574);
eq('无 Built by 时头像为空数组', items[1].avatars, []);

console.log('【异常输入】');
eq('空字符串返回空数组', parse('', 'daily').length, 0);
eq('null 返回空数组', parse(null, 'daily').length, 0);
eq(
  'React 空壳（没有 Box-row）返回空数组',
  parse('<html><body><div id="react-app"></div></body></html>', 'daily').length, 0
);
eq(
  'Box-row 但缺 h2 的残缺块被跳过',
  parse('<article class="Box-row"><p class="col-9">x</p></article>', 'daily').length,
  0
);

console.log('【周期文案】');
eq('weekly 的 hotUnit', parse(html, 'weekly')[0].hotUnit, '本周新增');
eq('monthly 的 hotUnit', parse(html, 'monthly')[0].hotUnit, '本月新增');

console.log('\n结果：' + pass + ' 通过 / ' + fails.length + ' 失败');
if (fails.length) {
  console.log(fails.join('\n'));
  process.exit(1);
}
