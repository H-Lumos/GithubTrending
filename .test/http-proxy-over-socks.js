/**
 * 本地 HTTP CONNECT 代理 → 转发到 SOCKS5（127.0.0.1:10808）
 * 用途：Chrome 的 --proxy-server 对 socks5 支持在本机不生效，
 *      但支持 http 代理，所以用一层薄转换让浏览器能出网。
 * 用法：node .test/http-proxy-over-socks.js 18118
 */
const net = require('net');

const LISTEN_PORT = Number(process.argv[2] || 18118);
const SOCKS = { host: '127.0.0.1', port: 10808 };

function socksConnect(targetHost, targetPort) {
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
        const h = Buffer.from(targetHost, 'utf8');
        sock.write(
          Buffer.concat([
            Buffer.from([0x05, 0x01, 0x00, 0x03, h.length]),
            h,
            Buffer.from([(targetPort >> 8) & 0xff, targetPort & 0xff])
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

const server = net.createServer((client) => {
  client.once('data', async (chunk) => {
    const first = chunk.toString('latin1');
    const m = first.match(/^CONNECT\s+([^\s:]+):(\d+)/i);
    if (!m) {
      client.end('HTTP/1.1 405 Method Not Allowed\r\n\r\n');
      return;
    }
    const host = m[1];
    const port = Number(m[2]);

    try {
      const upstream = await socksConnect(host, port);
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      client.pipe(upstream);
      upstream.pipe(client);
      const kill = () => {
        client.destroy();
        upstream.destroy();
      };
      client.on('error', kill);
      upstream.on('error', kill);
      client.on('close', () => upstream.destroy());
      upstream.on('close', () => client.destroy());
    } catch (e) {
      client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    }
  });
});

server.listen(LISTEN_PORT, '127.0.0.1', () => {
  console.log('CONNECT proxy on http://127.0.0.1:' + LISTEN_PORT + ' → socks5://' + SOCKS.host + ':' + SOCKS.port);
});
