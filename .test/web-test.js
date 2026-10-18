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
const URL = process.env.WEB_URL || require('url').pathToFileURL(require('path').join(__dirname, '..', 'web', 'index.html')).href + '?theme=dark';
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
  await sleep(1500);

  // 清掉上一轮留下的收藏/主题，保证每次都是确定状态
  await evalJs('localStorage.clear(); 1');
  await send('Page.reload');
  await sleep(1500);

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
    chips: document.querySelectorAll('.chip').length,
    expectDaily: window.TRENDING.periods.daily.length,
    expectFirst: window.TRENDING.periods.daily[0].repo,
    expectFirstId: window.TRENDING.periods.daily[0].id
  }))()`);
  check('默认深色主题', boot.theme === 'dark', boot.theme);
  check('卡片数 = 数据条数', boot.cards === boot.expectDaily, boot.cards + ' / 期望 ' + boot.expectDaily);
  check('首条 = 数据第 1 名', boot.first === boot.expectFirst, boot.first);
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
      label: document.getElementById('sortLabel').textContent,
      expect: window.TRENDING.periods.monthly.length,
      expectFirst: window.TRENDING.periods.monthly[0].repo
    }), 300));
  })()`);
  check('本月卡片数 = 数据条数', monthly.cards === monthly.expect, monthly.cards + ' / 期望 ' + monthly.expect);
  check('本月第 1 名 = 数据第 1 名', monthly.first === monthly.expectFirst, monthly.first);
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
  check('标题 = 首条项目', (detail.title || '').indexOf(boot.expectFirstId) > -1, detail.title);
  check('canvas 走势图已绘制', detail.hasChart === true);
  check('有英文原文引用块', detail.hasQuote === true);
  check('详情有中文说明', detail.hasZhDetail === true);
  check('URL 深链已写入', detail.url === boot.expectFirstId, detail.url);

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

  /* ---------- 7. 搜索 ---------- */
  console.log('\n[7] 搜索');
  const search = await evalJs(`(() => {
    const q = document.getElementById('q');
    function fire(v){ q.value = v; q.dispatchEvent(new Event('input', {bubbles:true})); }
    fire('claude');
    const hit = [...document.querySelectorAll('.card')].map(c => ({
      name: c.querySelector('.name').textContent,
      text: c.textContent.toLowerCase()
    }));
    const allMatch = hit.length > 0 && hit.every(h => h.text.indexOf('claude') > -1);
    const label = document.getElementById('sortLabel').textContent;
    fire('zzzzzz');
    const emptyState = document.querySelector('.state h3');
    const emptyText = emptyState ? emptyState.textContent : '';
    fire('');
    return new Promise(r => setTimeout(() => r({
      hitCount: hit.length, allMatch, label,
      emptyText, restored: document.querySelectorAll('.card').length
    }), 200));
  })()`);
  check('搜索 claude 命中且全匹配', search.hitCount > 0 && search.allMatch, search.hitCount + ' 条');
  check('搜索时列表头文案切换', search.label.indexOf('搜索') > -1, search.label);
  check('无结果时显示空态', search.emptyText.indexOf('没有匹配') > -1, search.emptyText);
  check('清空搜索后恢复 13 条', search.restored === 13, search.restored + ' 条');

  /* ---------- 8. 历史与曲线标注 ---------- */
  console.log('\n[8] 历史字段 / 曲线标注');
  const hist = await evalJs(`(() => {
    document.querySelector('.card').click();
    return new Promise(r => setTimeout(() => {
      const note = document.querySelector('.chart-note');
      r({
        hasPrevDay: window.TRENDING.hasPrevDay,
        historyDays: window.TRENDING.historyDays,
        realPoints: window.TRENDING.periods.daily[0].trendRealPoints,
        hasRankField: 'rankChange' in window.TRENDING.periods.daily[0],
        noteText: note ? note.textContent.trim() : '',
        badges: document.querySelectorAll('.rk').length
      });
    }, 500));
  })()`);
  check('数据里带历史字段', hist.hasPrevDay === false && hist.historyDays === 1, '首日 · ' + hist.historyDays + ' 天');
  check('条目带 rankChange 字段', hist.hasRankField === true);
  check('首日真实点数 = 1', hist.realPoints === 1, hist.realPoints + ' 点');
  check('曲线标注为估算', hist.noteText.indexOf('估算') > -1, hist.noteText);
  check('首日不显示升降徽章', hist.badges === 0, hist.badges + ' 个');

  await evalJs('document.getElementById("btnClose").click(); 1');
  await sleep(300);

  /* ---------- 9. 文案一致性 ---------- */
  console.log('\n[9] 文案一致性');
  const copy = await evalJs(`(() => {
    const body = document.body.innerText;
    return {
      hasUnknown: body.indexOf('Unknown') > -1,
      countText: document.getElementById('count').textContent.trim(),
      zhTotal: window.TRENDING.periods.daily.filter(i => i.hasZh).length,
      total: window.TRENDING.periods.daily.length,
      missingZh: window.TRENDING.periods.daily.filter(i => !i.hasZh).length
    };
  })()`);
  check('页面不出现英文 Unknown', copy.hasUnknown === false);
  check('顶部计数显示中文覆盖', /共 \d+ 个/.test(copy.countText), copy.countText);
  check(
    '今日榜单中文覆盖情况',
    copy.zhTotal === copy.total,
    copy.zhTotal + '/' + copy.total + (copy.missingZh ? '（缺 ' + copy.missingZh + '）' : '')
  );

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





