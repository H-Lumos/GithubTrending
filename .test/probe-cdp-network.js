/**
 * 用 CDP 抓 github.com/trending 的网络请求，找出页面上仓库列表来自哪个接口。
 * 前置：Chrome 以 --remote-debugging-port=9333 且带 socks5 代理启动。
 * 用法：node .test/probe-cdp-network.js 9333 https://github.com/trending
 */
const http = require('http');

const PORT = Number(process.argv[2] || 9333);
const URL_TO_OPEN = process.argv[3] || 'https://github.com/trending';

function cdpHttp(path, method) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: PORT, path, method: method || 'GET' },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            resolve(d);
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const ver = await cdpHttp('/json/version');
  console.log('browser:', (ver && ver.Browser) || JSON.stringify(ver).slice(0, 80));

  const target = await cdpHttp('/json/new?' + encodeURIComponent('about:blank'), 'PUT');
  if (!target || !target.webSocketDebuggerUrl) {
    console.log('创建 target 失败:', JSON.stringify(target).slice(0, 200));
    process.exit(1);
  }
  console.log('target:', target.id);

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const requests = new Map(); // requestId -> {url, type, mime, status, size}

  function send(method, params) {
    return new Promise((resolve) => {
      const msgId = ++id;
      pending.set(msgId, resolve);
      ws.send(JSON.stringify({ id: msgId, method, params: params || {} }));
    });
  }

  ws.addEventListener('message', (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch (e) {
      return;
    }
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result);
      pending.delete(msg.id);
      return;
    }
    if (msg.method === 'Network.requestWillBeSent') {
      const p = msg.params;
      requests.set(p.requestId, {
        url: p.request.url,
        type: p.type,
        method: p.request.method,
        mime: '',
        status: 0,
        size: 0
      });
    }
    if (msg.method === 'Network.responseReceived') {
      const p = msg.params;
      const r = requests.get(p.requestId);
      if (r) {
        r.mime = p.response.mimeType;
        r.status = p.response.status;
        r.fromCache = !!p.response.fromDiskCache;
      }
    }
    if (msg.method === 'Network.loadingFinished') {
      const r = requests.get(msg.params.requestId);
      if (r) r.size = msg.params.encodedDataLength;
    }
  });

  await new Promise((r) => ws.addEventListener('open', r));
  await send('Network.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: URL_TO_OPEN });

  // 等页面把数据请求发完
  await new Promise((r) => setTimeout(r, 9000));

  const all = Array.from(requests.values());
  console.log('\n总请求数:', all.length);

  const interesting = all.filter((r) => {
    const u = r.url;
    if (r.type === 'Document') return true;
    if (/\/trending/i.test(u)) return true;
    if (/graphql|api\.github|\/api\/|\.json(\?|$)/i.test(u)) return true;
    if (/application\/(json|graphql)/i.test(r.mime || '')) return true;
    return false;
  });

  console.log('\n=== 可疑请求（可能与榜单数据相关） ===');
  interesting.forEach((r, i) => {
    console.log(
      '[' + (i + 1) + '] ' + r.status + ' ' + (r.mime || '-') +
      ' ' + Math.round((r.size || 0) / 1024) + 'KB ' + r.method + ' ' + r.type
    );
    console.log('    ' + r.url.slice(0, 300));
  });

  // 按 MIME 统计：找出所有返回 JSON 的
  const jsons = all.filter((r) => /json/i.test(r.mime || ''));
  console.log('\n=== 所有 JSON 响应 ===');
  jsons.forEach((r) => {
    console.log('  ' + r.status + ' ' + Math.round((r.size || 0) / 1024) + 'KB  ' + r.url.slice(0, 260));
  });

  ws.close();
  process.exit(0);
})().catch((e) => {
  console.error('THROWN:', e && e.stack);
  process.exit(3);
});
