/**
 * 探针：多语言 trending 页面是否可抓、各有多少条
 * 用法：SOCKS_PORT=10808 node .test/probe-langs.js
 */
const { request } = require('../scripts/lib/http.js');

(async () => {
  const langs = [
    ['', '全局'],
    ['python', 'Python'],
    ['typescript', 'TypeScript'],
    ['rust', 'Rust'],
    ['go', 'Go'],
    ['swift', 'Swift'],
    ['c++', 'C++']
  ];

  for (const [slug, name] of langs) {
    const p = '/trending' + (slug ? '/' + slug : '') + '?since=daily';
    try {
      const r = await request('GET', 'https://github.com' + p, {
        Accept: 'text/html',
        'User-Agent': 'Mozilla/5.0'
      });
      const n = (r.body.match(/<article class="Box-row/g) || []).length;
      console.log('  ' + name.padEnd(12) + 'HTTP ' + r.status + '  条目 ' + n + '  ' + Math.round(r.body.length / 1024) + ' KB');
    } catch (e) {
      console.log('  ' + name.padEnd(12) + '失败: ' + e.message);
    }
  }
})();
