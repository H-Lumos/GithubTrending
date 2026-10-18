/**
 * 通过 miniprogram-automator 真正跑一遍小程序：截图 + 抓 console/异常 + 断言关键节点
 * 前置：DevTools 已开启服务端口，且已执行
 *   cli.bat auto --project <项目> --auto-port 9420 --port <服务端口>
 * 用法：node .test/run-automator.js
 */
const path = require('path');
const fs = require('fs');
const automator = require('miniprogram-automator');

const OUT = path.join(__dirname, '..', 'design', 'shots');
const WS = process.env.AUTO_WS || 'ws://127.0.0.1:9420';

fs.mkdirSync(OUT, { recursive: true });

const logs = [];
const errors = [];
const checks = [];
function check(name, ok, extra) {
  checks.push({ name, ok, extra });
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (extra ? '  → ' + extra : ''));
}

function flat(v) {
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch (e) {
    return String(v);
  }
}

/** 轮询等待某个页面状态成立，避免用固定 sleep 造成时序抖动 */
async function until(page, predicate, timeoutMs = 6000) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    last = await page.data();
    if (predicate(last)) return last;
    await page.waitFor(200);
  }
  return last;
}

(async () => {
  console.log('连接 ' + WS);
  const mp = await automator.connect({ wsEndpoint: WS });

  mp.on('console', (msg) => {
    const text = (msg && msg.args ? msg.args.map(flat) : [flat(msg)]).join(' ');
    logs.push({ type: (msg && msg.type) || 'log', text });
  });
  mp.on('exception', (err) => {
    errors.push(flat(err));
  });

  // 清掉收藏，保证每次跑都是确定状态（否则第二次跑会变成「取消收藏」）
  try {
    await mp.evaluate(function () {
      wx.removeStorageSync('ght:favs:v2');
      wx.removeStorageSync('ght:favs');
      return true;
    });
  } catch (e) {
    console.log('  (清 storage 失败，忽略): ' + e.message.slice(0, 60));
  }

  /* ---------------- 榜单页 ---------------- */
  console.log('\n[1] 打开榜单页');
  const page = await mp.reLaunch('/pages/trending/index');
  await page.waitFor(2500);

  const data = await page.data();
  const srcText = data.sourceText || '';
  const isRealtime = srcText.indexOf('快照') > -1 || srcText.indexOf('官方') > -1 || srcText.indexOf('云函数') > -1;

  check('页面路径正确', (await mp.currentPage()).path === 'pages/trending/index');
  check('列表有数据', (data.list || []).length > 0, (data.list || []).length + ' 条');
  check('没有 loading 卡死', data.loading === false, 'loading=' + data.loading);
  check('没有 error', !data.error, data.error || '无');
  check('数据源文案已设置', !!srcText, srcText);
  check('首条有用途文案', !!(data.list[0] && data.list[0].purpose), data.list[0] && data.list[0].purpose.slice(0, 28));
  check('首条有英文原文', !!(data.list[0] && data.list[0].descEn));
  check('首条 trend 有 30 点', !!(data.list[0] && data.list[0].trend && data.list[0].trend.length === 30));

  // 快照/云函数模式下，必须与 GitHub 官方榜单一致
  if (isRealtime) {
    check(
      '今日榜单条数与官方一致',
      (data.list || []).length === 13,
      (data.list || []).length + ' 条（官方 13）'
    );
    check(
      '今日第 1 名与官方一致',
      data.list[0] && data.list[0].fullName === 'anthropics/claude-plugins-official',
      data.list[0] && data.list[0].fullName
    );
    check(
      '今日第 2 名与官方一致',
      data.list[1] && data.list[1].fullName === 'MadsLorentzen/ai-job-search',
      data.list[1] && data.list[1].fullName
    );
  }

  await mp.screenshot({ path: path.join(OUT, '01-trending.png') });

  // 顶部是否可见（曾经的 bug：内部 scroll-view 被滚走，header 看不见）
  const heroEl = await page.$('.hero');
  const heroOff = heroEl ? await heroEl.offset() : null;
  check(
    '顶部 header 在视口内',
    !!heroOff && heroOff.top >= 0 && heroOff.top < 120,
    'hero.top=' + (heroOff ? heroOff.top : 'n/a')
  );
  console.log('  截图 01-trending.png');

  /* ---------------- 切换周期 ---------------- */
  console.log('\n[2] 切换到「本月」');
  // 组件内部元素 page.$ 查不到，所以直接在「自定义组件宿主节点」上派发 change 事件
  const segComp = await page.$('.cmp-segment');
  check('找到分段组件节点', !!segComp);
  if (segComp) {
    await segComp.trigger('change', { value: 'monthly', label: '本月' });
    const d2 = await until(page, (s) => s.period === 'monthly' && (s.list || []).length > 0);
    check('周期切到 monthly', d2.period === 'monthly', d2.period);
    check('unitLabel 跟随变化', d2.unitLabel === '本月新增', d2.unitLabel);
    check('切换后仍有数据', (d2.list || []).length > 0, (d2.list || []).length + ' 条');
    if (isRealtime) {
      check('本月榜单条数与官方一致', (d2.list || []).length === 21, (d2.list || []).length + ' 条（官方 21）');
      check(
        '本月第 1 名与官方一致',
        d2.list[0] && d2.list[0].fullName === 'cloudflare/security-audit-skill',
        d2.list[0] && d2.list[0].fullName
      );
    }

    const heroAfter = await page.$('.hero');
    const offAfter = heroAfter ? await heroAfter.offset() : null;
    check(
      '切周期后自动回到顶部',
      !!offAfter && offAfter.top >= 0,
      'hero.top=' + (offAfter ? offAfter.top : 'n/a')
    );
    await mp.screenshot({ path: path.join(OUT, '02-monthly.png') });
    console.log('  截图 02-monthly.png');
  }

  /* ---------------- 语言筛选 ---------------- */
  console.log('\n[3] 语言筛选');
  const chipComp = await page.$('.cmp-langs');
  check('找到语言筛选组件节点', !!chipComp);
  if (chipComp) {
    const before = (await page.data()).language;
    // 快照/云函数模式用 python；mock 模式用 typescript
    const target = isRealtime ? 'python' : 'typescript';
    const expectLang = isRealtime ? 'Python' : 'TypeScript';
    await chipComp.trigger('change', { value: target });
    const d3 = await until(
      page,
      (s) => s.language === target && (s.list || []).length > 0
    );
    check('语言筛选生效', d3.language === target, before + ' → ' + d3.language);
    check(
      '筛选后列表非空且全部同语言',
      (d3.list || []).length > 0 && d3.list.every((i) => i.language === expectLang),
      (d3.list || []).length + ' 条 ' + expectLang
    );
    await mp.screenshot({ path: path.join(OUT, '03-filter-' + target + '.png') });
    console.log('  截图 03-filter-' + target + '.png');
    await chipComp.trigger('change', { value: '' });
    await page.waitFor(1200);
  }

  /* ---------------- 详情页 ---------------- */
  console.log('\n[4] 进入详情页');
  const cards = await page.$$('.cmp-card');
  check('卡片已渲染', cards.length > 0, cards.length + ' 张');
  let shotDone = false;
  if (cards.length > 0) {
    // 直接给宿主节点派发组件的自定义事件（等价于点了卡片内部）
    const firstId = (await page.data()).list[0].id;
    await cards[0].trigger('opentap', { id: firstId });
    await page.waitFor(2000);
    const cur = await mp.currentPage();
    check('路由跳到 detail', cur.path === 'pages/detail/index', cur.path);

    const dd = await cur.data();
    check('详情有 item', !!dd.item, dd.item && dd.item.repo);
    check('详情有中文详情', !!(dd.item && dd.item.detail), dd.item && dd.item.detail.slice(0, 24));
    check('详情有英文原文', !!(dd.item && dd.item.descEn));
    check('趋势图 canvas 未降级', dd.chartFailed === false, 'chartFailed=' + dd.chartFailed);
    check('30 天区间文案有值', !!dd.rangeText, dd.rangeText);
    check('轴标签 5 个', (dd.axis || []).length === 5, (dd.axis || []).length + ' 个');

    await mp.screenshot({ path: path.join(OUT, '03-detail.png') });
    console.log('  截图 03-detail.png');
    shotDone = true;

    /* ---------------- 收藏 ---------------- */
    console.log('\n[5] 收藏 → 收藏页');
    const favBtn = await cur.$('.ghost');
    if (favBtn) {
      if ((await cur.data()).faved) {
        await favBtn.tap(); // 先确保是未收藏状态
        await page.waitFor(500);
      }
      await favBtn.tap();
      await page.waitFor(700);
      const favData = await cur.data();
      check('收藏状态切换', favData.faved === true, 'faved=' + favData.faved);
    }

    const favPage = await mp.navigateTo('/pages/favorites/index');
    await favPage.waitFor(1200);
    const fd = await favPage.data();
    check('收藏页有条目', (fd.list || []).length > 0, (fd.list || []).length + ' 条');
    await mp.screenshot({ path: path.join(OUT, '04-favorites.png') });
    console.log('  截图 04-favorites.png');
  }

  /* ---------------- 关于页 ---------------- */
  console.log('\n[6] 关于页');
  const about = await mp.navigateTo('/pages/about/index');
  await about.waitFor(1000);
  const ad = await about.data();
  check('关于页有版本号', !!ad.version, ad.version);
  check('关于页显示数据模式', !!ad.modeText, ad.modeText);
  await mp.screenshot({ path: path.join(OUT, '05-about.png') });
  console.log('  截图 05-about.png');

  /* ---------------- 汇总 ---------------- */
  console.log('\n=== console 输出（前 15 条）===');
  if (!logs.length) console.log('  （无）');
  logs.slice(0, 15).forEach((l) => console.log('  [' + l.type + '] ' + l.text.slice(0, 160)));

  console.log('\n=== 运行时异常 ===');
  if (!errors.length) console.log('  （无）');
  errors.slice(0, 10).forEach((e) => console.log('  ' + String(e).slice(0, 300)));

  const failed = checks.filter((c) => !c.ok);
  console.log('\n=== 断言汇总 ===');
  console.log('通过 ' + (checks.length - failed.length) + ' / ' + checks.length + '，异常 ' + errors.length + ' 个');
  if (failed.length) {
    console.log('失败项：');
    failed.forEach((f) => console.log('  - ' + f.name + (f.extra ? ' (' + f.extra + ')' : '')));
  }

  await mp.disconnect();
  process.exit(failed.length || errors.length ? 2 : 0);
})().catch((e) => {
  console.error('THROWN:', e && e.stack);
  process.exit(3);
});
