/**
 * 用真实 GitHub Search API 数据验证 getTrending 的归一化逻辑
 * 用法：node .test/run-normalize.js [daily|weekly|monthly]
 */
const fs = require('fs');
const path = require('path');
const { httpsGet } = require('./socks.js');

const fnPath = path.join(__dirname, '..', 'cloudfunctions', 'getTrending', 'index.js');
const model = require(fnPath);

function dayStr(offset) {
  const d = new Date(Date.now() + offset * 86400000);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
}

(async () => {
  const period = process.argv[2] || 'daily';
  const meta = model.__PERIOD_META[period] || model.__PERIOD_META.daily;

  const q = 'created:>=' + dayStr(-meta.window) + ' stars:>=' + meta.minStars;
  const p =
    '/search/repositories?q=' + encodeURIComponent(q) +
    '&sort=stars&order=desc&per_page=40';

  console.log('QUERY:', q);
  const t0 = Date.now();
  const res = await httpsGet('api.github.com', p);
  console.log('HTTP', res.status, 'bytes', res.body.length, 'cost', Date.now() - t0 + 'ms');

  if (res.status !== 200) {
    console.log('抓取失败：' + res.body.slice(0, 300));
    process.exit(1);
  }

  const json = JSON.parse(res.body);
  fs.writeFileSync(path.join(__dirname, 'sample-search-' + period + '.json'), res.body, 'utf8');
  console.log('total_count =', json.total_count, '| 本页 =', (json.items || []).length);

  const items = model.__normalizeSearch(json, period);

  console.log('\n=== 归一化结果（前 8 条，按涨星速度排） ===');
  const sorted = items.slice().sort((a, b) => b.hot - a.hot);
  sorted.slice(0, 8).forEach((it, i) => {
    console.log(
      '#' + (i + 1) + ' ' + it.fullName +
      ' | ' + it.language +
      ' | ★' + it.stars +
      ' | ' + it.hot + '/周期' +
      ' | 建于 ' + (it.createdAt || '').slice(0, 10)
    );
    console.log('    EN:', (it.descEn || '(无)').slice(0, 90));
    console.log('    主题:', (it.topics || []).join(', ').slice(0, 80));
  });

  // 校验
  const problems = [];
  const must = ['id','owner','repo','fullName','url','descEn','language','languageColor','stars','forks','hot','hotUnit','topics','initial','rank'];
  items.forEach((it, i) => {
    must.forEach((k) => { if (!(k in it)) problems.push('#' + i + ' 缺字段 ' + k); });
    if (!/^https:\/\/github\.com\//.test(it.url)) problems.push('#' + i + ' url 异常');
    if (!it.id || it.id.split('/').length !== 2) problems.push('#' + i + ' id 异常: ' + it.id);
    if (it.hot <= 0) problems.push('#' + i + ' hot<=0');
    if (it.hot > it.stars) problems.push('#' + i + ' hot>stars');
    if (!it.initial) problems.push('#' + i + ' initial 为空');
    if (it.descEn && /[<>]/.test(it.descEn)) problems.push('#' + i + ' 描述含尖括号');
  });

  console.log('\n字段完整性:', problems.length ? 'FAIL' : 'PASS');
  if (problems.length) console.log(problems.slice(0, 8).join('\n'));

  // 三周期一致性：hot(monthly) > hot(weekly) > hot(daily)，且不超 stars
  const d = model.__normalizeSearch(json, 'daily');
  const w = model.__normalizeSearch(json, 'weekly');
  const m = model.__normalizeSearch(json, 'monthly');
  const scaleOk = d.every((it, i) => it.hot <= w[i].hot && w[i].hot <= m[i].hot && m[i].hot <= it.stars);
  console.log('周期缩放一致(d<=w<=m<=stars):', scaleOk ? 'PASS' : 'FAIL');
  console.log('样例:', d[0] && [d[0].hot, w[0].hot, m[0].hot, d[0].stars].join(' / '));

  // 语言筛选映射
  console.log('\n语言 slug → Search 限定名:');
  ['python', 'typescript', 'cpp', 'go'].forEach((slug) => {
    const name = model.__LANGUAGES.filter((l) => l.value === slug)[0];
    console.log('  ' + slug + ' => language:"' + (name ? name.name : '?') + '"');
  });

  process.exit(problems.length === 0 && scaleOk ? 0 : 2);
})().catch((e) => {
  console.error('THROWN:', e && e.stack);
  process.exit(3);
});
