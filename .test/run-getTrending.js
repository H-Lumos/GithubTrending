/**
 * getTrending 集成测试（不依赖云环境）
 * 用法：NODE_PATH=<本项目>/.test/node_modules node .test/run-getTrending.js daily
 */
const path = require('path');
const fn = require(path.join(__dirname, '..', 'cloudfunctions', 'getTrending', 'index.js'));

(async () => {
  const period = process.argv[2] || 'daily';
  const language = process.argv[3] || '';

  const t0 = Date.now();
  const res = await fn.main({ period, language });
  const ms = Date.now() - t0;

  if (!res || res.ok !== true) {
    console.log('RESULT: FAILED');
    console.log(JSON.stringify(res, null, 2).slice(0, 1200));
    process.exit(1);
  }

  const items = res.items || [];
  console.log('RESULT: OK');
  console.log('period =', res.period, '| language =', JSON.stringify(res.language), '| items =', items.length, '| cost =', ms + 'ms');
  console.log('');

  const sample = items.slice(0, 5);
  sample.forEach((it, i) => {
    console.log(
      [
        '#' + (i + 1),
        it.fullName,
        '| ' + it.language,
        '| ★' + it.stars,
        '| +' + it.hot + '/' + period,
        '| trend=' + (it.trend ? it.trend.length + '点' + (it.trendEstimated ? '(估算)' : '') : '无')
      ].join(' ')
    );
    console.log('   EN :', (it.descEn || '(空)').slice(0, 110));
    console.log('   ZH :', (it.purpose || '(空)').slice(0, 110));
    console.log('   URL:', it.url);
    console.log('');
  });

  // 结构完整性检查
  const must = ['id', 'owner', 'repo', 'fullName', 'url', 'descEn', 'purpose', 'detail', 'tags', 'language', 'languageColor', 'stars', 'forks', 'hot', 'trend', 'rank', 'initial'];
  const problems = [];
  items.forEach((it, idx) => {
    must.forEach((k) => {
      if (!(k in it)) problems.push('item#' + idx + ' 缺字段 ' + k);
    });
    if (!Array.isArray(it.trend) || it.trend.length < 2) problems.push('item#' + idx + ' trend 异常');
    if (!/^https:\/\/github\.com\//.test(it.url)) problems.push('item#' + idx + ' url 异常: ' + it.url);
    if (!it.purpose) problems.push('item#' + idx + ' purpose 为空');
  });
  const ranks = items.map((i) => i.rank).join(',');
  const ranksOk = ranks === items.map((_, i) => i + 1).join(',');

  console.log('结构检查:', problems.length === 0 ? 'PASS' : 'FAIL');
  if (problems.length) console.log(problems.slice(0, 10).join('\n'));
  console.log('rank 连续:', ranksOk ? 'PASS' : 'FAIL');
  console.log('热榜降序:', items.every((it, i) => i === 0 || items[i - 1].hot >= it.hot) ? 'PASS' : 'FAIL');

  process.exit(problems.length === 0 && ranksOk ? 0 : 2);
})().catch((e) => {
  console.error('THROWN:', e && e.stack);
  process.exit(3);
});
