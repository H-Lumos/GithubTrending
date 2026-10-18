/** 探测可用的 Trending JSON 数据源（本机走 socks5） */
const net = require('net');
const tls = require('tls');
const SOCKS = { host: '127.0.0.1', port: 10808 };

function socksConnect(host, port) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(SOCKS.port, SOCKS.host);
    let stage = 'greeting';
    let buf = Buffer.alloc(0);
    const to = setTimeout(() => { sock.destroy(); reject(new Error('socks timeout')); }, 12000);
    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (stage === 'greeting') {
        if (buf.length < 2) return;
        buf = buf.subarray(2);
        stage = 'connect';
        const h = Buffer.from(host, 'utf8');
        sock.write(Buffer.concat([Buffer.from([5,1,0,3,h.length]), h, Buffer.from([(port>>8)&255, port&255])]));
      }
      if (stage === 'connect') {
        if (buf.length < 5) return;
        if (buf[1] !== 0) { clearTimeout(to); sock.destroy(); reject(new Error('rep=' + buf[1])); return; }
        const atyp = buf[3];
        const addrLen = atyp === 1 ? 4 : atyp === 4 ? 16 : buf[4];
        if (buf.length < 4 + (atyp === 3 ? 1 : 0) + addrLen + 2) return;
        clearTimeout(to); sock.removeListener('data', onData); resolve(sock);
      }
    };
    sock.on('data', onData);
    sock.on('error', (e) => { clearTimeout(to); reject(e); });
    sock.write(Buffer.from([5,1,0]));
  });
}

function get(host, pathname, headers) {
  return new Promise(async (resolve, reject) => {
    let raw;
    try { raw = await socksConnect(host, 443); } catch (e) { return reject(e); }
    const t = tls.connect({ socket: raw, servername: host, rejectUnauthorized: false }, () => {
      t.write('GET ' + pathname + ' HTTP/1.1\r\nHost: ' + host + '\r\n' +
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0\r\n' +
        'Accept: application/json\r\nAccept-Encoding: identity\r\nConnection: close\r\n' +
        (headers || '') + '\r\n');
    });
    let data = Buffer.alloc(0);
    t.on('data', (c) => { data = Buffer.concat([data, c]); });
    t.on('end', () => {
      raw.destroy();
      const text = data.toString('utf8');
      const i = text.indexOf('\r\n\r\n');
      const head = text.slice(0, i);
      let body = text.slice(i + 4);
      if (/transfer-encoding:\s*chunked/i.test(head)) {
        let out = ''; let p = 0;
        while (p < body.length) {
          const nl = body.indexOf('\r\n', p); if (nl === -1) break;
          const size = parseInt(body.slice(p, nl), 16); if (!size) break;
          out += body.substr(nl + 2, size); p = nl + 2 + size + 2;
        }
        body = out;
      }
      resolve({ status: parseInt((head.match(/HTTP\/1\.[01] (\d+)/) || [])[1], 10), body });
    });
    t.on('error', reject);
    setTimeout(() => { t.destroy(); reject(new Error('tls timeout')); }, 20000);
  });
}

const cases = [
  ['api.gitterapp.com', '/repositories?since=daily&spoken_language_code='],
  ['api.ossinsight.io', '/v1/trends/repos/?period=past_24_hours'],
  ['gh-trending-api.herokuapp.com', '/repositories?since=daily'],
  ['github-trending-api.vercel.app', '/repositories?since=daily'],
  ['api.github.com', '/search/repositories?q=created:%3E2026-10-11+stars:%3E50&sort=stars&order=desc&per_page=5']
];

(async () => {
  for (const [h, p] of cases) {
    try {
      const r = await get(h, p);
      const head = r.body.slice(0, 240).replace(/\s+/g, ' ');
      console.log('\n● ' + h + p);
      console.log('  status=' + r.status + ' bytes=' + r.body.length);
      console.log('  ' + head);
      if (r.status === 200) {
        try {
          const j = JSON.parse(r.body);
          const arr = Array.isArray(j) ? j : j.items || j.data || j.rows || j.repositories || null;
          if (Array.isArray(arr)) {
            console.log('  数组长度=' + arr.length + ' 首元素键=' + Object.keys(arr[0] || {}).join(','));
          } else {
            console.log('  顶层键=' + Object.keys(j).join(','));
          }
        } catch (e) {
          console.log('  非 JSON');
        }
      }
    } catch (e) {
      console.log('\n● ' + h + p + '\n  ERROR ' + e.message);
    }
  }
})();
