/** 极简 SOCKS5 + TLS GET 工具（仅本机测试用） */
const net = require('net');
const tls = require('tls');

const SOCKS = { host: '127.0.0.1', port: 10808 };

function socksConnect(host, port, timeout) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(SOCKS.port, SOCKS.host);
    let stage = 'greeting';
    let buf = Buffer.alloc(0);
    const to = setTimeout(() => {
      sock.destroy();
      reject(new Error('socks timeout'));
    }, timeout || 15000);

    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (stage === 'greeting') {
        if (buf.length < 2) return;
        if (buf[0] !== 0x05 || buf[1] !== 0x00) {
          clearTimeout(to);
          sock.destroy();
          reject(new Error('socks: auth method rejected'));
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
          reject(new Error('socks: connect rep=' + buf[1]));
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

/** GET https://host+pathname，返回 { status, body, rawBytes, contentLength, complete } */
async function httpsGet(host, pathname, headers) {
  const raw = await socksConnect(host, 443);
  return new Promise((resolve, reject) => {
    const t = tls.connect({ socket: raw, servername: host, rejectUnauthorized: false }, () => {
      t.write(
        'GET ' + pathname + ' HTTP/1.1\r\n' +
        'Host: ' + host + '\r\n' +
        'User-Agent: GithubTrending-Test/1.0\r\n' +
        'Accept: application/vnd.github+json, application/json\r\n' +
        'Accept-Encoding: identity\r\n' +
        (headers || '') +
        'Connection: close\r\n\r\n'
      );
    });

    let data = Buffer.alloc(0);
    let settled = false;
    t.on('data', (c) => {
      data = Buffer.concat([data, c]);
    });

    const finish = () => {
      if (settled) return;
      settled = true;
      raw.destroy();

      // 必须在字节层面切分：chunked 的 size 是字节数，字符串下标会破坏多字节字符
      const sep = data.indexOf(Buffer.from('\r\n\r\n'));
      if (sep === -1) {
        reject(new Error('bad response'));
        return;
      }
      const head = data.subarray(0, sep).toString('latin1');
      let bodyBuf = data.subarray(sep + 4);
      const clM = head.match(/content-length:\s*(\d+)/i);
      const contentLength = clM ? parseInt(clM[1], 10) : null;

      if (/transfer-encoding:\s*chunked/i.test(head)) {
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
        bodyBuf = Buffer.concat(parts);
      }

      const body = bodyBuf.toString('utf8');
      resolve({
        status: parseInt((head.match(/HTTP\/1\.[01] (\d+)/) || [])[1], 10),
        body,
        rawBytes: data.length,
        contentLength,
        complete: contentLength == null ? true : bodyBuf.length === contentLength
      });
    };

    t.on('end', finish);
    t.on('close', finish);
    t.on('error', reject);
    setTimeout(() => {
      t.destroy();
      if (!settled) {
        settled = true;
        reject(new Error('tls timeout'));
      }
    }, 20000);
  });
}

module.exports = { httpsGet };
