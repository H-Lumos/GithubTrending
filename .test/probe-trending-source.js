/**
 * 探测 GitHub Trending 的数据来源：HTML 是否仍服务端渲染？还是有 JSON 接口？
 * 逐个尝试不同的路径 / Header 组合，报告返回体积与关键标记。
 */
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
          reject(new Error('auth'));
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
          reject(new Error('rep=' + buf[1]));
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

function rawGet(host, pathname, headers) {
  return new Promise(async (resolve, reject) => {
    let raw;
    try {
      raw = await socksConnect(host, 443);
    } catch (e) {
      reject(e);
      return;
    }
    const t = tls.connect({ socket: raw, servername: host, rejectUnauthorized: false }, () => {
      t.write('GET ' + pathname + ' HTTP/1.1\r\nHost: ' + host + '\r\n' + headers + 'Connection: close\r\n\r\n');
    });
    let data = Buffer.alloc(0);
    t.on('data', (c) => {
      data = Buffer.concat([data, c]);
    });
    t.on('end', () => {
      raw.destroy();
      const text = data.toString('utf8');
      const i = text.indexOf('\r\n\r\n');
      const head = text.slice(0, i);
      let body = text.slice(i + 4);
      if (/transfer-encoding:\s*chunked/i.test(head)) {
        let out = '';
        let p = 0;
        while (p < body.length) {
          const nl = body.indexOf('\r\n', p);
          if (nl === -1) break;
          const size = parseInt(body.slice(p, nl), 16);
          if (!size) break;
          out += body.substr(nl + 2, size);
          p = nl + 2 + size + 2;
        }
        body = out;
      }
      resolve({
        status: parseInt((head.match(/^HTTP\/1\.[01] (\d+)/) || [])[1], 10),
        head: head.slice(0, 900),
        body
      });
    });
    t.on('error', reject);
    setTimeout(() => {
      t.destroy();
      reject(new Error('tls timeout'));
    }, 20000);
  });
}

const UA_CHROME =
  'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36\r\n';
const UA_CURL = 'User-Agent: curl/8.7.1\r\n';

const cases = [
  {
    name: 'A) HTML + Chrome UA',
    host: 'github.com',
    path: '/trending?since=daily',
    headers: UA_CHROME + 'Accept: text/html,application/xhtml+xml\r\nAccept-Language: en-US,en;q=0.9\r\n'
  },
  {
    name: 'B) HTML + curl UA',
    host: 'github.com',
    path: '/trending?since=daily',
    headers: UA_CURL + 'Accept: text/html\r\n'
  },
  {
    name: 'C) Accept: application/json',
    host: 'github.com',
    path: '/trending?since=daily',
    headers: UA_CHROME + 'Accept: application/json\r\nX-Requested-With: XMLHttpRequest\r\n'
  },
  {
    name: 'D) /trending/daily 路径式',
    host: 'github.com',
    path: '/trending/daily',
    headers: UA_CURL + 'Accept: text/html\r\n'
  },
  {
    name: 'E) 搜索 API（对照）',
    host: 'api.github.com',
    path: '/search/repositories?q=stars:%3E50000&sort=stars&order=desc&per_page=3',
    headers: UA_CURL + 'Accept: application/vnd.github+json\r\n'
  }
];

(async () => {
  for (const c of cases) {
    try {
      const r = await rawGet(c.host, c.path, c.headers);
      const hasArticle = r.body.indexOf('<article class="Box-row"') > -1;
      const hasStarsToday = r.body.indexOf('stars today') > -1;
      const hasJsonItems = r.body.indexOf('"items"') > -1 || r.body.indexOf('"repositories"') > -1;
      const ct = (r.head.match(/content-type:\s*([^\r\n]+)/i) || [])[1] || '';
      console.log(
        '\n' + c.name +
        '\n  status=' + r.status +
        ' bytes=' + r.body.length +
        ' contentType=' + ct.trim() +
        '\n  Box-row=' + hasArticle +
        ' "stars today"=' + hasStarsToday +
        ' jsonItems=' + hasJsonItems
      );
      if (c.name.indexOf('E)') === 0) {
        console.log('  body head:', r.body.slice(0, 200).replace(/\s+/g, ' '));
      }
    } catch (e) {
      console.log('\n' + c.name + '\n  ERROR ' + e.message);
    }
  }
})();
