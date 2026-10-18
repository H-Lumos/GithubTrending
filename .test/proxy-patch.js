/**
 * 把 https.get 劫持成「走本地 SOCKS5」的实现。
 * 目的：本机直连 GitHub 被重置，但云函数代码只能用 https 直连；
 *      劫持模块方法后就能在本地完整跑通 getTrending（含真实抓取）。
 * 注意：这是测试专用，云函数部署到腾讯云后是直连，不需要代理。
 */
const https = require('https');
const tls = require('tls');
const net = require('net');
const { URL } = require('url');
const { EventEmitter } = require('events');

const SOCKS = { host: '127.0.0.1', port: Number(process.env.SOCKS_PORT || 10808) };

function socksConnect(host, port) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(SOCKS.port, SOCKS.host);
    let stage = 'greeting';
    let buf = Buffer.alloc(0);
    const to = setTimeout(() => {
      sock.destroy();
      reject(new Error('socks timeout'));
    }, 15000);

    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (stage === 'greeting') {
        if (buf.length < 2) return;
        if (buf[0] !== 0x05 || buf[1] !== 0x00) {
          clearTimeout(to);
          sock.destroy();
          reject(new Error('socks auth rejected'));
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
        if (buf.length < 4 + (atyp === 0x03 ? 1 : 0) + addrLen + 2) return;
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

function dechunk(bodyBuf) {
  const parts = [];
  let p = 0;
  while (p < bodyBuf.length) {
    const nl = bodyBuf.indexOf(Buffer.from('\r\n'), p);
    if (nl === -1) break;
    const size = parseInt(bodyBuf.subarray(p, nl).toString('latin1'), 16);
    if (!size) break;
    const start = nl + 2;
    parts.push(bodyBuf.subarray(start, start + size));
    p = start + size + 2;
  }
  return Buffer.concat(parts);
}

function install() {
  https.get = function (url, opts, cb) {
    if (typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    const u = new URL(url);
    const req = new EventEmitter();
    req.setTimeout = () => req;
    req.destroy = () => {};
    req.end = () => {};

    (async () => {
      const port = Number(u.port || 443);
      const raw = await socksConnect(u.hostname, port);
      const t = tls.connect({ socket: raw, servername: u.hostname, rejectUnauthorized: false }, () => {
        const h = Object.assign({ Host: u.host, Connection: 'close' }, opts.headers || {});
        const head =
          'GET ' + u.pathname + (u.search || '') + ' HTTP/1.1\r\n' +
          Object.keys(h)
            .filter((k) => h[k] != null)
            .map((k) => k + ': ' + h[k])
            .join('\r\n') +
          '\r\n\r\n';
        t.write(head);
      });

      let buf = Buffer.alloc(0);
      t.on('data', (c) => {
        buf = Buffer.concat([buf, c]);
      });
      t.on('error', (e) => req.emit('error', e));
      t.on('end', () => {
        raw.destroy();
        const sep = buf.indexOf(Buffer.from('\r\n\r\n'));
        if (sep === -1) {
          req.emit('error', new Error('bad response'));
          return;
        }
        const head = buf.subarray(0, sep).toString('latin1');
        let bodyBuf = buf.subarray(sep + 4);
        if (/transfer-encoding:\s*chunked/i.test(head)) bodyBuf = dechunk(bodyBuf);

        const status = parseInt((head.match(/HTTP\/1\.[01] (\d+)/) || [])[1], 10);
        const locM = head.match(/\r\nlocation:\s*([^\r\n]+)/i);
        const res = new EventEmitter();
        res.statusCode = status;
        res.headers = { location: locM ? locM[1] : undefined };
        res.setEncoding = () => {};
        res.resume = () => {};
        cb(res);
        const text = bodyBuf.toString('utf8');
        process.nextTick(() => {
          res.emit('data', text);
          res.emit('end');
        });
      });
    })().catch((e) => req.emit('error', e));

    return req;
  };
  console.log('[proxy-patch] https.get → socks5://' + SOCKS.host + ':' + SOCKS.port);
}

module.exports = { install };
