/**
 * 用 CDP 测量布局 + 截图（比 --screenshot 可靠，且能拿到具体数值）
 * 用法：node .test/cdp-shot.js <width> <height> <url> <outfile>
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const W = Number(process.argv[2] || 1280);
const H = Number(process.argv[3] || 1000);
const URL = process.argv[4] || 'file:///G:/newscollecting/GithubTrending/web/index.html?theme=dark';
const OUT = process.argv[5] || path.join(__dirname, '..', 'design', 'shots', 'cdp.png');
const DSF = Number(process.argv[6] || 2);
const PORT = 9333 + (Number(process.env.PORT_OFFSET) || 0);

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profile = path.join(os.tmpdir(), 'cdp-shot-' + Date.now());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function rpc(ws, id, method, params) {
  return new Promise((resolve, reject) => {
    const handler = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (e) {
        return;
      }
      if (msg.id === id) {
        ws.removeEventListener('message', handler);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
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
      '--hide-scrollbars',
      '--remote-debugging-port=' + PORT,
      '--user-data-dir=' + profile,
      '--window-size=' + W + ',' + H,
      'about:blank'
    ],
    { stdio: 'ignore', detached: false }
  );

  // 等端口就绪
  let wsUrl = null;
  for (let i = 0; i < 40 && !wsUrl; i++) {
    await sleep(250);
    try {
      const res = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      const list = await res.json();
      const page = (list || []).filter((t) => t.type === 'page')[0];
      if (page && page.webSocketDebuggerUrl) wsUrl = page.webSocketDebuggerUrl;
    } catch (e) {
      /* 还没起来 */
    }
  }
  if (!wsUrl) throw new Error('CDP 端口没起来');

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });

  let id = 0;
  const send = (m, p) => rpc(ws, ++id, m, p);

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: W,
    height: H,
    deviceScaleFactor: DSF,
    mobile: W < 600
  });

  await send('Page.navigate', { url: URL });
  await sleep(2500);

  // 关键测量：页面是否横向溢出 / 卡片宽度 / 抽屉位置
  const measure = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const de = document.documentElement;
      const cards = [...document.querySelectorAll('.card')];
      const c0 = cards[0] ? cards[0].getBoundingClientRect() : null;
      const wrap = document.querySelector('.wrap').getBoundingClientRect();
      return {
        innerWidth: window.innerWidth,
        scrollWidth: de.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        overflowX: de.scrollWidth - window.innerWidth,
        wrapWidth: Math.round(wrap.width),
        cardCount: cards.length,
        cardWidth: c0 ? Math.round(c0.width) : null,
        cardRight: c0 ? Math.round(c0.right) : null,
        theme: de.getAttribute('data-theme'),
        drawerOpen: document.getElementById('drawer').classList.contains('on'),
        firstTitle: (document.querySelector('.card .name b') || {}).textContent || null,
        firstPurpose: (document.querySelector('.card .purpose') || {}).textContent || null
      };
    })()`
  });

  console.log(JSON.stringify(measure.result.value, null, 2));

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log('screenshot → ' + OUT + ' (' + Math.round(fs.statSync(OUT).size / 1024) + ' KB)');

  ws.close();
  chrome.kill();
  await sleep(300);
  process.exit(0);
})().catch((e) => {
  console.error('THROWN:', e.message);
  process.exit(1);
});

