/**
 * 极简 HTTP 客户端（GET / POST JSON）
 * - 默认直连（GitHub Actions 上用这条）
 * - 设了 SOCKS_PORT 就走本地 SOCKS5（本机被墙时用）
 * 只有这一个依赖，避免给 CI 装包。
 */
const https = require('https');
const tls = require('tls');
const net = require('net');
const { URL } = require('url');

const SOCKS_PORT = Number(process.env.SOCKS_PORT || 0);

function socksConnect(host, port) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(SOCKS_PORT, '127.0.0.1');
    let stage = 'greeting';
    let buf = Buffer.alloc(0);
    const to = setTimeout(() => {
      sock.destroy();
      reject(new Error('socks timeout'));
    }, 20000);

    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (stage === 'greeting') {
        if (buf.length < 2) return;
        if (buf[0] !== 0x05 || buf[1] !== 0x00) {
          clearTimeout(to);
          sock.destroy();
          reject(new Error('socks rejected'));
          return;
        }
        buf = buf.subarray(2);
        stage = 'connect';
        const h = Buffer.from(host, 'utf8');
        sock.write(
          Buffer.concat([
            Buffer.from([0x05, 0x01, 0x00, 0x03, h.length]),
            h,
            Buffer.from([(port >> 8) & 0xff, port & 0xff])
          ])
        );
      }
      if (stage === 'connect') {
        if (buf.length < 5) return;
        if (buf[1] !== 0x00) {
          clearTimeout(to);
          sock.destroy();
          reject(new Error('socks rep=' + buf[1]));
          return;
        }
        const atyp = buf[3];
        const addrLen = atyp === 0x01 ? 4 : atyp === 0x04 ? 16 : buf[4];
        const need = 4 + (atyp === 0x03 ? 1 : 0) + addrLen + 2;
        if (buf.length < need) return;
        clearTimeout(to);
        sock.removeListener('data', onData);
        resolve(sock);
      }
    };

    sock.on('data', onData);
    sock.on('error', (e) => {
      clearTimeout(to);
      reject(e);
    });
    sock.write(Buffer.from([0x05, 0x01, 0x00]));
  });
}

function dechunk(buf) {
  const parts = [];
  let p = 0;
  while (p < buf.length) {
    const nl = buf.indexOf(Buffer.from('\r\n'), p);
    if (nl === -1) break;
    const size = parseInt(buf.subarray(p, nl).toString('latin1'), 16);
    if (!size) break;
    parts.push(buf.subarray(nl + 2, nl + 2 + size));
    p = nl + 2 + size + 2;
  }
  return Buffer.concat(parts);
}

/** 直连版请求（按协议选 http / https，方便本地起 mock 服务测试） */
function directRequest(u, method, headers, body) {
  const mod = u.protocol === 'http:' ? require('http') : https;
  return new Promise((resolve, reject) => {
    const req = mod.request(
      {
        hostname: u.hostname,
        port: Number(u.port || (u.protocol === 'http:' ? 80 : 443)),
        path: u.pathname + (u.search || ''),
        method: method,
        headers: headers
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') })
        );
      }
    );
    req.on('error', reject);
    req.setTimeout(60000, () => {
      req.destroy(new Error('request timeout'));
    });
    if (body) req.write(body);
    req.end();
  });
}

/** 经 SOCKS5 的请求（自己拨 TLS，避免依赖外部代理进程） */
async function socksRequest(u, method, headers, body) {
  const port = Number(u.port || 443);
  const raw = await socksConnect(u.hostname, port);
  return new Promise((resolve, reject) => {
    const t = tls.connect({ socket: raw, servername: u.hostname }, () => {
      const h = Object.assign({ Host: u.host, Connection: 'close' }, headers);
      if (body) h['Content-Length'] = Buffer.byteLength(body);
      let head = method + ' ' + u.pathname + (u.search || '') + ' HTTP/1.1\r\n';
      Object.keys(h).forEach((k) => {
        head += k + ': ' + h[k] + '\r\n';
      });
      head += '\r\n';
      t.write(head);
      if (body) t.write(body);
    });

    let buf = Buffer.alloc(0);
    t.on('data', (c) => {
      buf = Buffer.concat([buf, c]);
    });
    t.on('error', reject);
    t.on('end', () => {
      raw.destroy();
      const sep = buf.indexOf(Buffer.from('\r\n\r\n'));
      if (sep === -1) return reject(new Error('bad response'));
      const head = buf.subarray(0, sep).toString('latin1');
      let b = buf.subarray(sep + 4);
      if (/transfer-encoding:\s*chunked/i.test(head)) b = dechunk(b);
      const status = parseInt((head.match(/HTTP\/1\.[01] (\d+)/) || [])[1], 10);
      resolve({ status: status, headers: {}, body: b.toString('utf8') });
    });
  });
}

async function request(method, url, headers, body) {
  const u = new URL(url);
  return SOCKS_PORT ? socksRequest(u, method, headers || {}, body) : directRequest(u, method, headers || {}, body);
}

function getJson(url, headers) {
  return request('GET', url, headers).then((r) => {
    if (r.status < 200 || r.status >= 300) throw new Error('HTTP ' + r.status + ': ' + r.body.slice(0, 200));
    return JSON.parse(r.body);
  });
}

function postJson(url, headers, payload) {
  const body = JSON.stringify(payload);
  const h = Object.assign({ 'Content-Type': 'application/json' }, headers);
  return request('POST', url, h, body).then((r) => {
    if (r.status < 200 || r.status >= 300) throw new Error('HTTP ' + r.status + ': ' + r.body.slice(0, 300));
    return JSON.parse(r.body);
  });
}

module.exports = { request, getJson, postJson };
