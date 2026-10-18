/**
 * 网页版交互冒烟测试（CDP 真点击，不是看代码猜）
 * 用法：node .test/web-test.js [width]
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const W = Number(process.argv[2] || 1280);
const H = Number(process.argv[3] || 900);
const URL = process.env.WEB_URL || 'file:///G:/newscollecting/GithubTrending/web/index.html?theme=dark';
const PORT = 9400;

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = path.join(os.tmpdir(), 'cdp-test-' + Date.now());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, ok, extra) {
  results.push({ name, ok, extra });
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  → ' + extra : ''));
}

function rpc(ws, id, method, params) {
  return new Promise((resolve, reject) => {
    const handler = (ev) => {
      let m;
      try {
        m = JSON.parse(ev.data);
      } catch (e) {
        return;
      }
      if (m.id === id) {
        ws.removeEventListener('message', handler);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}

(async () => {
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--disable-gpu',
      ...(URL && !URL.startsWith('file:') ? ['--proxy-server=http://127.0.0.1:18118'] : []),
      '--hide-scrollbars',
      '--remote-debugging-port=' + PORT,
      '--user-data-dir=' + profile,
      '--window-size=' + W + ',' + H,
      'about:blank'
    ],
    { stdio: 'ignore' }
  );

  let wsUrl = null;
  for (let i = 0; i < 40 && !wsUrl; i++) {
    await sleep(250);
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      const p = (list || []).filter((t) => t.type === 'page')[0];
      if (p) wsUrl = p.webSocketDebuggerUrl;
    } catch (e) {}
  }
  if (!wsUrl) throw new Error('CDP 没起来');

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });

  let id = 0;
  const send = (m, p) => rpc(ws, ++id, m, p);
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: expr });
    return r.result.value;
  };

  const errors = [];
  ws.addEventListener('message', (ev) => {
    try {
      const m = JSON.parse(ev.data);
      if (m.method === 'Runtime.exceptionThrown') {
        errors.push(m.params.exceptionDetails.text || 'exception');
      }
    } catch (e) {}
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 600 });
  await send('Page.navigate', { url: URL });
  await sleep(2000);

  /* ---------- 1. 首屏 ---------- */
  console.log('\n[1] 首屏');
  const boot = await evalJs(`(() => ({
    theme: document.documentElement.dataset.theme,
    cards: document.querySelectorAll('.card').length,
    first: document.querySelector('.card .name b')?.textContent,
    purpose: document.querySelector('.card .purpose')?.textContent,
    hasZh: /[\\u4e00-\\u9fa5]/.test(document.querySelector('.card .purpose')?.textContent || ''),
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    tabs: document.querySelectorAll('#seg button').length,
    chips: document.querySelectorAll('.chip').length
  }))()`);
  check('默认深色主题', boot.theme === 'dark', boot.theme);
  check('今日 13 张卡片', boot.cards === 13, boot.cards + ' 张');
  check('首条是官方第 1 名', boot.first === 'claude-plugins-official', boot.first);
  check('首条有中文用途', boot.hasZh, (boot.purpose || '').slice(0, 24));
  check('无横向溢出', boot.overflow <= 0, 'overflow=' + boot.overflow);
  check('周期 tab 三个', boot.tabs === 3, boot.tabs + ' 个');
  check('语言 chip 已渲染', boot.chips >= 5, boot.chips + ' 个');

  /* ---------- 2. 切周期 ---------- */
  console.log('\n[2] 切到「本月」');
  const monthly = await evalJs(`(() => {
    document.querySelector('#seg button[data-period="monthly"]').click();
    return new Promise(r => setTimeout(() => r({
      cards: document.querySelectorAll('.card').length,
      first: document.querySelector('.card .name b')?.textContent,
      label: document.getElementById('sortLabel').textContent
    }), 300));
  })()`);
  check('本月 21 张卡片', monthly.cards === 21, monthly.cards + ' 张');
  check('本月第 1 名正确', monthly.first === 'security-audit-skill', monthly.first);
  check('排序文案跟随周期', monthly.label.indexOf('本月') > -1, monthly.label);

  /* ---------- 3. 语言筛选 ---------- */
  console.log('\n[3] 语言筛选 Python');
  const filtered = await evalJs(`(() => {
    document.querySelector('#seg button[data-period="daily"]').click();
    const chips = [...document.querySelectorAll('.chip')];
    const py = chips.find(c => c.textContent.trim() === 'Python');
    py.click();
    return new Promise(r => setTimeout(() => {
      const cards = [...document.querySelectorAll('.card')];
      const langs = cards.map(c => c.querySelector('.meta .lang').textContent.trim());
      r({ n: cards.length, allPy: langs.every(l => l === 'Python'), uniq: [...new Set(langs)] });
    }, 300));
  })()`);
  check('筛选后只剩 Python', filtered.allPy, filtered.n + ' 张 · ' + JSON.stringify(filtered.uniq));
  await evalJs(`(() => { document.querySelector('.chip[data-lang=""]').click(); return 1; })()`);
  await sleep(250);

  /* ---------- 4. 详情抽屉 ---------- */
  console.log('\n[4] 打开详情');
  const detail = await evalJs(`(() => {
    document.querySelector('.card').click();
    return new Promise(r => setTimeout(() => {
      const cv = document.getElementById('chart');
      r({
        open: document.getElementById('drawer').classList.contains('on'),
        title: document.querySelector('.dname')?.textContent,
        hasChart: !!cv && cv.width > 100 && cv.height > 50,
        hasQuote: !!document.querySelector('.quote'),
        hasZhDetail: /[\\u4e00-\\u9fa5]/.test(document.querySelector('.dtext')?.textContent || ''),
        url: new URL(location.href).searchParams.get('open')
      });
    }, 600));
  })()`);
  check('抽屉已打开', detail.open === true);
  check('标题是首条项目', (detail.title || '').indexOf('claude-plugins-official') > -1, detail.title);
  check('canvas 走势图已绘制', detail.hasChart === true);
  check('有英文原文引用块', detail.hasQuote === true);
  check('详情有中文说明', detail.hasZhDetail === true);
  check('URL 深链已写入', detail.url === 'anthropics/claude-plugins-official', detail.url);

  /* ---------- 5. 收藏 ---------- */
  console.log('\n[5] 收藏');
  const fav = await evalJs(`(() => {
    document.getElementById('btnFavItem').click();
    return new Promise(r => setTimeout(() => {
      const raw = localStorage.getItem('ght:favs') || '{}';
      r({ stored: Object.keys(JSON.parse(raw)).length, badge: document.getElementById('favCount').textContent });
    }, 250));
  })()`);
  check('收藏写入 localStorage', fav.stored === 1, fav.stored + ' 条');
  check('顶部角标显示 1', fav.badge === '1', fav.badge);

  /* ---------- 6. 关闭 + 主题 ---------- */
  console.log('\n[6] 关闭抽屉 / 切主题');
  const misc = await evalJs(`(() => {
    document.getElementById('btnClose').click();
    document.getElementById('btnTheme').click();
    return new Promise(r => setTimeout(() => r({
      closed: !document.getElementById('drawer').classList.contains('on'),
      theme: document.documentElement.dataset.theme,
      url: new URL(location.href).searchParams.get('open')
    }), 250));
  })()`);
  check('抽屉已关闭', misc.closed === true);
  check('主题切到浅色', misc.theme === 'light', misc.theme);
  check('关闭后 URL 深链已清', misc.url === null, String(misc.url));

  console.log('\n=== 运行时异常 ===');
  console.log(errors.length ? errors.slice(0, 5).join('\n') : '  （无）');

  const failed = results.filter((r) => !r.ok);
  console.log('\n=== 汇总 ===');
  console.log('通过 ' + (results.length - failed.length) + ' / ' + results.length + '，异常 ' + errors.length + ' 个');
  if (failed.length) failed.forEach((f) => console.log('  ✗ ' + f.name));

  ws.close();
  chrome.kill();
  await sleep(300);
  process.exit(failed.length || errors.length ? 1 : 0);
})().catch((e) => {
  console.error('THROWN:', e.message);
  process.exit(3);
});


