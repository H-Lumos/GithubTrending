/**
 * DeepSeek 文案生成的离线测试：起一个本地 mock 服务，完全按真实协议走一遍
 * 不需要 API Key、不联网、不花钱
 * 用法：node .test/run-llm.js
 */
const http = require('http');
const path = require('path');

/* ---------------- mock 服务 ---------------- */
let mode = 'ok';
let lastBody = null;
let lastHeaders = null;
let callCount = 0;

const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => {
    raw += c;
  });
  req.on('end', () => {
    callCount++;
    lastBody = JSON.parse(raw);
    lastHeaders = req.headers;

    const reply = (content) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: content } }] }));
    };

    if (mode === 'ok') {
      reply(
        JSON.stringify({
          purpose: '一个用来测试的中文用途',
          detail: '第一句说明用途。第二句说明特点。第三句说明适合谁。',
          tags: ['测试', '示例']
        })
      );
    } else if (mode === 'fenced') {
      reply('```json\n' + JSON.stringify({ purpose: '被代码块包住的中文', detail: '仍然应该被正确解析出来。', tags: [] }) + '\n```');
    } else if (mode === 'garbage') {
      reply('抱歉，我无法完成这个请求。');
    } else if (mode === 'short') {
      reply(JSON.stringify({ purpose: '短', detail: '', tags: [] }));
    } else if (mode === 'http500') {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'server exploded' }));
    }
  });
});

let pass = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) {
    pass++;
    console.log('  ✓ ' + name + (extra ? '  → ' + extra : ''));
  } else {
    fails.push(name);
    console.log('  ✗ ' + name + (extra ? '  → ' + extra : ''));
  }
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  // 必须在 require 之前设好，llm.js 在模块加载时读取 BASE
  process.env.LLM_BASE_URL = 'http://127.0.0.1:' + port;
  delete process.env.SOCKS_PORT;
  const llm = require(path.join(__dirname, '..', 'scripts', 'lib', 'llm.js'));

  const item = {
    id: 'acme/demo',
    fullName: 'acme/demo',
    language: 'Go',
    descEn: 'A tiny demo project for tests.',
    topics: ['demo']
  };

  console.log('【正常生成】');
  const r1 = await llm.generateOne('fake-key', item);
  ok('返回结构化结果', r1 && r1.purpose === '一个用来测试的中文用途', r1 && r1.purpose);
  ok('detail / tags 齐备', r1.detail.length > 8 && r1.tags.length === 2, r1.tags.join(','));
  ok('带 generatedAt 与 model', !!r1.generatedAt && !!r1.model, r1.model);
  ok('请求带 Bearer 头', lastHeaders.authorization === 'Bearer fake-key', lastHeaders.authorization);
  ok('请求体含 model 与 json 模式', lastBody.model && lastBody.response_format.type === 'json_object', lastBody.model);
  ok('system 提示词已发送', lastBody.messages[0].role === 'system' && lastBody.messages[0].content.length > 50);
  ok('用户提示词包含仓库名与描述', /acme\/demo/.test(lastBody.messages[1].content) && /tiny demo/.test(lastBody.messages[1].content));

  console.log('【README 素材】');
  mode = 'ok';
  await llm.generateOne('fake-key', {
    id: 'no/desc',
    fullName: 'no/desc',
    language: 'JavaScript',
    descEn: '',
    topics: [],
    readmeExcerpt: 'An open taxonomy of what children learn across primary years.'
  });
  const userMsg = lastBody.messages[1].content;
  ok('无描述时把 README 摘录发给模型', userMsg.indexOf('open taxonomy of what children learn') > -1);
  ok('prompt 标明这是 README 摘录', /README 摘录/.test(userMsg));
  ok('无描述时提示「没有填写描述」', /没有填写描述/.test(userMsg));

  console.log('【容错：模型返回 ```json 代码块】');
  mode = 'fenced';
  const r2 = await llm.generateOne('fake-key', item);
  ok('代码块包裹也能解析', r2.purpose === '被代码块包住的中文', r2.purpose);

  console.log('【报错：返回废话】');
  mode = 'garbage';
  let err = null;
  try {
    await llm.generateOne('fake-key', item);
  } catch (e) {
    err = e;
  }
  ok('非 JSON 内容会抛错（不会污染数据）', !!err && /不是 JSON/.test(err.message), err && err.message.slice(0, 40));

  console.log('【报错：字段不合法】');
  mode = 'short';
  err = null;
  try {
    await llm.generateOne('fake-key', item);
  } catch (e) {
    err = e;
  }
  ok('purpose 太短会抛错', !!err && /字段不合法/.test(err.message), err && err.message.slice(0, 40));

  console.log('【报错：HTTP 500】');
  mode = 'http500';
  err = null;
  try {
    await llm.generateOne('fake-key', item);
  } catch (e) {
    err = e;
  }
  ok('HTTP 错误会抛错', !!err && /HTTP 500/.test(err.message), err && err.message.slice(0, 40));

  console.log('【批量：部分失败不影响其它】');
  mode = 'ok';
  const before = callCount;
  const batch = await llm.generateMany('fake-key', [item, { id: 'b/y', fullName: 'b/y', descEn: 'x' }], { limit: 2 });
  ok('批量成功 2 条', Object.keys(batch.ok).length === 2, Object.keys(batch.ok).join(','));
  ok('失败列表为空', batch.failed.length === 0);
  ok('确实发了 2 次请求', callCount - before === 2, String(callCount - before));

  console.log('【批量：limit 生效】');
  const before2 = callCount;
  const limited = await llm.generateMany('fake-key', [item, { id: 'c/z' }, { id: 'd/w' }], { limit: 1 });
  ok('只生成 limit 条', Object.keys(limited.ok).length === 1, Object.keys(limited.ok).join(','));
  ok('剩余计入 skipped', limited.skipped === 2, String(limited.skipped));
  ok('只发了 1 次请求', callCount - before2 === 1, String(callCount - before2));

  console.log('【缓存时效】');
  const now = Date.now();
  ok('刚生成的算新鲜', llm.isFresh({ purpose: 'x', generatedAt: now }, now) === true);
  ok('超过 TTL 算过期', llm.isFresh({ purpose: 'x', generatedAt: now - (llm.TTL_DAYS + 1) * 86400000 }, now) === false);
  ok('没有时间戳算过期', llm.isFresh({ purpose: 'x' }, now) === false);

  /* ---------------- README 抓取（本地 mock GitHub API） ---------------- */
  console.log('【README 抓取】');
  const gh = http.createServer((req, res) => {
    if (req.url.indexOf('/readme') === -1) {
      res.writeHead(404);
      res.end('{}');
      return;
    }
    if (req.url.indexOf('/no-desc/') > -1) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('# Title\n\n```js\nconst x = 1;\n```\n![logo](http://x/y.png)\n\nAn open taxonomy of **what children learn** across primary years.');
      return;
    }
    if (req.url.indexOf('/noreadme/') > -1) {
      res.writeHead(404);
      res.end('{"message":"Not Found"}');
      return;
    }
    res.writeHead(401);
    res.end('{"message":"Bad credentials"}');
  });
  await new Promise((r) => gh.listen(0, '127.0.0.1', r));
  process.env.GH_API_BASE = 'http://127.0.0.1:' + gh.address().port;
  process.env.GITHUB_TOKEN = 'fake';

  const snapMod = require(path.join(__dirname, '..', 'scripts', 'snapshot.js'));
  const ex1 = await snapMod.fetchReadmeExcerpt('no-desc', 'repo');
  ok('取到 README 并清理', ex1.indexOf('what children learn') > -1 && ex1.length > 20, ex1.slice(0, 40));
  ok('去掉了代码块', ex1.indexOf('const x = 1') === -1);
  ok('去掉了图片标记', ex1.indexOf('logo') === -1);
  ok('保留正文', ex1.indexOf('An open taxonomy') > -1);

  const ex2 = await snapMod.fetchReadmeExcerpt('noreadme', 'repo');
  ok('没有 README 时返回空串', ex2 === '');

  const ex3 = await snapMod.fetchReadmeExcerpt('bad', 'repo');
  ok('401 时返回空串（不抛错）', ex3 === '');

  gh.close();
  delete process.env.GH_API_BASE;
  server.close();
  console.log('\n结果：' + pass + ' 通过 / ' + fails.length + ' 失败');
  if (fails.length) {
    console.log('失败项：' + fails.join(', '));
    process.exit(1);
  }
})().catch((e) => {
  console.error('THROWN:', e && e.stack);
  server.close();
  process.exit(3);
});


