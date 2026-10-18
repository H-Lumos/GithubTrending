/** 定位「顶部 header 不见」问题：查元素是否存在、位置、滚动偏移 */
const path = require('path');
const automator = require('miniprogram-automator');

(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  const page = await mp.reLaunch('/pages/trending/index');
  await page.waitFor(2000);

  const d = await page.data();
  console.log('=== data 关键字段 ===');
  console.log('statusBarHeight =', d.statusBarHeight);
  console.log('theme           =', d.theme);
  console.log('period          =', d.period);
  console.log('list.length     =', (d.list || []).length);
  console.log('sourceText      =', d.sourceText);

  console.log('\n=== 顶层元素是否存在于页面树 ===');
  for (const sel of ['.page', '.scroller', '.content', '.hero', '.title', '.subtitle', '.listhead', '.footer']) {
    const el = await page.$(sel);
    if (!el) {
      console.log('  ' + sel + ' → 不存在');
      continue;
    }
    const off = await el.offset();
    console.log('  ' + sel + ' → top=' + off.top + ' left=' + off.left + ' w=' + off.width + ' h=' + off.height);
  }

  console.log('\n=== 系统信息 ===');
  const sys = await mp.callWxMethod('getWindowInfo');
  console.log('  statusBarHeight =', sys.statusBarHeight);
  console.log('  windowHeight    =', sys.windowHeight);
  console.log('  screenHeight    =', sys.screenHeight);
  console.log('  pixelRatio      =', sys.pixelRatio);
  console.log('  safeArea        =', JSON.stringify(sys.safeArea));

  console.log('\n=== 滚回顶部后截图 ===');
  try {
    await mp.callWxMethod('pageScrollTo', { scrollTop: 0, duration: 0 });
  } catch (e) {
    console.log('  pageScrollTo 失败:', e.message);
  }
  await page.waitFor(800);
  await mp.screenshot({ path: path.join(__dirname, '..', 'design', 'shots', 'debug-top.png') });
  console.log('  已存 debug-top.png');

  await mp.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error('THROWN:', e && e.stack);
  process.exit(3);
});
