/**
 * 用真实 GitHub trending 页面验证 parseOfficialTrending
 * 走本地 SOCKS5（本机直连被重置；腾讯云上的云函数是直连可达的）
 * 用法：NODE_PATH=.test/node_modules node .test/run-official-live.js [daily|weekly|monthly] [语言value]
 */
const fs = require('fs');
const path = require('path');
const { httpsGet } = require('./socks.js');

const model = require(path.join(__dirname, '..', 'cloudfunctions', 'getTrending', 'index.js'));

const LANG = model.__LANGUAGES;
const META = model.__PERIOD_META;

(async () => {
  const period = process.argv[2] || 'daily';
  const langValue = process.argv[3] || '';
  const langMeta = LANG.filter((l) => l.value === langValue)[0];
  const slug = langMeta ? langMeta.slug : '';

  const p = '/trending' + (slug ? '/' + slug : '') + '?since=' + (META[period] || META.daily).since;
  console.log('GET https://github.com' + p);

  const res = await httpsGet('github.com', p, 'Accept: text/html,application/xhtml+xml\r\nAccept-Language: en-US,en;q=0.9\r\n');
  console.log('HTTP', res.status, '| 原始字节', res.rawBytes, '| body 长度', res.body.length);

  const hasBoxRow = res.body.indexOf('<article class="Box-row"') > -1;
  const hasStarsToday = /stars\s+(today|this week|this month)/i.test(res.body);
  console.log('含 <article class="Box-row">:', hasBoxRow);
  console.log('含 "stars today":', hasStarsToday);

  const items = model.__parseOfficial(res.body, period);
  console.log('\n解析出仓库数:', items.length);

  if (!items.length) {
    console.log('\n⚠️ 命中 React 空壳变体（没有 Box-row），官方通道会降级到 Search API');
    console.log('HTML 前 300 字符:', res.body.slice(0, 300).replace(/\s+/g, ' '));
    // 存一份样本便于排查
    fs.writeFileSync(path.join(__dirname, 'sample-trending-shell.html'), res.body, 'utf8');
    process.exit(0);
  }

  fs.writeFileSync(path.join(__dirname, 'sample-trending-' + period + '.html'), res.body, 'utf8');

  console.log('\n=== 前 10 条（官方顺序）===');
  items.slice(0, 10).forEach((it) => {
    console.log(
      '#' + it.rank + ' ' + it.fullName +
      ' | ' + it.language +
      ' | ★' + it.stars +
      ' | +' + it.hot + '/周期' +
      ' | 头像 ' + it.avatars.length
    );
    console.log('    EN: ' + (it.descEn || '(无)').slice(0, 88));
  });

  const withDesc = items.slice(0, 10).filter((i) => !!i.descEn).length;
  const checks = [];
  checks.push(['仓库数 ≥ 10（GitHub 对无登录请求可能只给 13~25 条）', items.length >= 10]);
  checks.push(['前 10 条都有 star', items.slice(0, 10).every((i) => i.stars > 0)]);
  checks.push(['前 10 条都有 hot', items.slice(0, 10).every((i) => i.hot > 0)]);
  checks.push(['前 10 条描述覆盖率 ≥ 80%（共 ' + withDesc + '/10）', withDesc >= 8]);
  checks.push(['语言全部识别', items.every((i) => i.language && i.language !== 'Unknown')]);
  checks.push(['url 全部合法', items.every((i) => i.url.startsWith('https://github.com/'))]);
  checks.push(['id 全部是 owner/repo', items.every((i) => i.id.split('/').length === 2)]);
  checks.push(['rank 连续', items.every((i, k) => i.rank === k + 1)]);

  console.log('\n=== 断言 ===');
  let bad = 0;
  checks.forEach(([name, ok]) => {
    if (!ok) bad++;
    console.log((ok ? '  ✓ ' : '  ✗ ') + name);
  });
  console.log(bad ? '\n失败 ' + bad + ' 项' : '\n全部通过');
  process.exit(bad ? 2 : 0);
})().catch((e) => {
  console.error('THROWN:', e && e.stack);
  process.exit(3);
});
