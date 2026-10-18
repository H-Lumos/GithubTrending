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

  /**
   * 等页面真正就绪：数据已加载 + 目标元素存在。
   * 线上走代理比 file:// 慢，固定 sleep 容易在 reload 后抢跑（踩过）。
   */
  const waitReady = async (selector, timeoutMs) => {
    const deadline = Date.now() + (timeoutMs || 12000);
    while (Date.now() < deadline) {
      const ok = await evalJs(`!!(window.TRENDING && document.querySelector(${JSON.stringify(selector || '#q')}))`);
      if (ok) return true;
      await sleep(250);
    }
    return false;
  };

  /** reload 并等到就绪 */
  const reloadReady = async () => {
    await send('Page.reload', { ignoreCache: true });
    await sleep(600);
    return waitReady('#q');
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
  await reloadReady();

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

  /* ---------- 10. 收藏视图：跨周期 + 掉榜 ---------- */
  console.log('\n[10] 收藏视图（跨周期 / 已下榜）');
  const favCase = await evalJs(`(() => {
    const T = window.TRENDING;
    const dailyId = T.periods.daily[0].id;
    // 找一个不在今日榜、但在本周或本月榜的项目（跨周期收藏）
    const dailyIds = T.periods.daily.map(d => d.id);
    const cross = (T.periods.weekly || []).concat(T.periods.monthly || [])
      .find(w => dailyIds.indexOf(w.id) === -1);
    // 造一个「已掉出所有榜单」的收藏快照（真实场景：收藏后掉榜）
    const ghost = {
      id: 'ghost/not-on-any-list', owner: 'ghost', repo: 'not-on-any-list', fullName: 'ghost/not-on-any-list',
      purpose: '收藏时的中文快照', descEn: 'collected snapshot',
      language: 'TypeScript', languageColor: '#3178c6',
      stars: 314548, hot: 239923, trend: [1,2,3,4], ts: Date.now() - 86400000
    };
    const favs = {};
    favs[dailyId] = { id: dailyId, ts: Date.now() };
    if (cross) favs[cross.id] = { id: cross.id, ts: Date.now() - 1000 };
    favs[ghost.id] = ghost;
    localStorage.setItem('ght:favs', JSON.stringify(favs));
    return { dailyId, crossId: cross ? cross.id : null, count: Object.keys(favs).length };
  })()`);
  await reloadReady();

  const favView = await evalJs(`(() => {
    document.getElementById('btnFav').click();
    return new Promise(r => setTimeout(() => r({
      cards: document.querySelectorAll('.card').length,
      total: document.getElementById('total').textContent.trim(),
      sort: document.getElementById('sortLabel').textContent.trim(),
      offBadge: document.querySelectorAll('.rk-off').length,
      names: [].slice.call(document.querySelectorAll('.card .name b')).map(e => e.textContent)
    }), 350));
  })()`);
  check('收藏视图显示全部收藏（不再漏）', favView.cards === favCase.count, favView.cards + ' / 期望 ' + favCase.count);
  check('计数文案为「N 个收藏」', /个收藏/.test(favView.total), favView.total);
  check('排序文案为按收藏时间', /收藏时间/.test(favView.sort), favView.sort);
  check('掉榜项目标「已下榜」', favView.offBadge === 1, favView.offBadge + ' 个');
  check('掉榜项目仍在列表里', favView.names.indexOf('not-on-any-list') > -1, favView.names.join(','));

  const ghostDetail = await evalJs(`(() => {
    const cards = [].slice.call(document.querySelectorAll('.card'));
    const g = cards.filter(c => c.getAttribute('data-id') === 'ghost/not-on-any-list')[0];
    if (!g) return { opened: false };
    g.click();
    return new Promise(r => setTimeout(() => r({
      opened: document.getElementById('drawer').classList.contains('on'),
      badge: (document.querySelector('.dbadge') || {}).textContent || '',
      name: (document.querySelector('.dname') || {}).textContent || ''
    }), 350));
  })()`);
  check('掉榜项目能打开详情', ghostDetail.opened === true);
  check('详情标注「已下榜」', /已下榜/.test(ghostDetail.badge), ghostDetail.badge.trim().slice(0, 30));
  check('详情显示原仓库名', /ghost|not-on-any-list/.test(ghostDetail.name), ghostDetail.name);

  await evalJs('document.getElementById("btnClose").click(); localStorage.removeItem("ght:favs"); 1');
  await reloadReady();

  /* ---------- 11. 搜索高亮 / 命中片段 ---------- */
  console.log('\n[11] 搜索高亮与命中片段');
  const hlCase = await evalJs(`(() => {
    const q = document.getElementById('q');
    const T = window.TRENDING;
    const daily = T.periods.daily;

    // 找一个「只在英文描述靠后位置命中」的仓库（正是 rea→creation 那种情况）
    let late = null;
    const probe = (kw) => daily.find(it => {
      const p = String(it.purpose || '').toLowerCase();
      const n = it.fullName.toLowerCase();
      const e = String(it.descEn || '').toLowerCase();
      const i = e.indexOf(kw);
      return i > 60 && p.indexOf(kw) === -1 && n.indexOf(kw) === -1;
    });
    const kw = 'rea';
    late = probe(kw);

    function search(v) {
      q.value = v;
      q.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const out = {};

    search(kw);
    const cards = [].slice.call(document.querySelectorAll('.card'));
    out.count = cards.length;
    out.marks = document.querySelectorAll('.card mark.hl').length;
    const enSnippet = cards.map(c => {
      const en = c.querySelector('.en');
      const mk = en ? en.querySelector('mark.hl') : null;
      return mk ? { text: en.textContent, mark: mk.textContent } : null;
    }).filter(Boolean);
    out.hasSnippet = enSnippet.some(s => s.text.indexOf('…') > -1);
    out.markTexts = enSnippet.map(s => s.mark.toLowerCase());
    out.lateId = late ? late.id : null;

    // 语言命中
    search('python');
    const pyCards = [].slice.call(document.querySelectorAll('.card'));
    out.langMarked = pyCards.every(c => {
      const lang = c.querySelector('.lang');
      return lang && lang.querySelector('mark.hl');
    });

    // 多关键词 AND：用一个存在的词 + 一个不存在的词，结果必须是 0（若是 OR 会保留前者）
    const langA = String(T.periods.daily[0].language || 'python').toLowerCase();
    search(langA);
    out.oneToken = document.querySelectorAll('.card').length;
    search(langA + ' zzznotexist');
    out.andZero = document.querySelectorAll('.card').length;
    search(langA + ' ' + langA);
    out.dupToken = document.querySelectorAll('.card').length;
    search(langA + ' ' + langA.split('')[0]);
    out.andLabel2 = document.getElementById('sortLabel').textContent.trim();

    search('');
    out.restored = document.querySelectorAll('.card').length;
    return out;
  })()`);
  check('搜索命中处有高亮', hlCase.marks > 0, hlCase.marks + ' 处 mark');
  check('英文描述截取命中片段（不是从开头截断）', hlCase.hasSnippet === true, hlCase.lateId || '');
  check('片段里高亮的就是搜索词', (hlCase.markTexts || []).indexOf('rea') > -1, (hlCase.markTexts || []).join(','));
  check('语言命中也高亮', hlCase.langMarked === true);
  check('多关键词按 AND 匹配', hlCase.oneToken > 0 && hlCase.andZero === 0, hlCase.oneToken + ' 条 → 加无关词后 ' + hlCase.andZero + ' 条');
  check('重复关键词不影响结果', hlCase.dupToken === hlCase.oneToken, hlCase.dupToken + ' = ' + hlCase.oneToken);
  check('清空后恢复全量', hlCase.restored > 0, hlCase.restored + ' 条');

  /* ---------- 12. 静态资源指纹（防止改了 JS 却跑旧代码） ---------- */
  console.log('\n[12] 静态资源指纹');
  const ver = await evalJs(`(() => {
    const js = document.querySelector('script[src*="app.js"]');
    const css = document.querySelector('link[href*="app.css"]');
    return {
      js: js ? js.getAttribute('src') : '',
      css: css ? css.getAttribute('href') : '',
      // 直接量 computed style（file:// 下读 cssRules 会被安全策略拦）
      markStyle: (() => {
        const m = document.createElement('mark');
        m.className = 'hl';
        m.textContent = 'x';
        document.body.appendChild(m);
        const bg = getComputedStyle(m).backgroundColor;
        m.remove();
        return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
      })()
    };
  })()`);
  check('app.js 引用带 ?v= 指纹', /\?v=[0-9a-f]{6,}/.test(ver.js), ver.js);
  check('app.css 引用带 ?v= 指纹', /\?v=[0-9a-f]{6,}/.test(ver.css), ver.css);
  check('高亮样式已生效', ver.markStyle === true);

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











