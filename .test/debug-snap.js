/** 连拍对比：确认「顶部 header 缺失」是渲染问题还是截图时机/滚动问题 */
const path = require('path');
const automator = require('miniprogram-automator');
const OUT = path.join(__dirname, '..', 'design', 'shots');

(async () => {
  const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' });
  const page = await mp.reLaunch('/pages/trending/index');

  const snap = async (tag) => {
    try {
      await mp.screenshot({ path: path.join(OUT, 'dbg-' + tag + '.png') });
      const hero = await page.$('.hero');
      const title = await page.$('.title');
      const off = hero ? await hero.offset() : null;
      const txt = title ? await title.text() : '(无 .title)';
      console.log('  [' + tag + '] hero.top=' + (off ? off.top : 'n/a') + '  .title="' + txt + '"');
    } catch (e) {
      console.log('  [' + tag + '] 失败: ' + e.message);
    }
  };

  await page.waitFor(300);
  await snap('t300');
  await page.waitFor(1200);
  await snap('t1500');
  await page.waitFor(1500);
  await snap('t3000');

  // 显式滚到顶部再拍
  try {
    await page.setData({}); // 触发一次渲染
  } catch (e) {}
  try {
    await mp.callWxMethod('pageScrollTo', { scrollTop: 0, duration: 0 });
    console.log('  pageScrollTo 成功');
  } catch (e) {
    console.log('  pageScrollTo 失败: ' + e.message.slice(0, 80));
  }
  await page.waitFor(600);
  await snap('scrolled0');

  await mp.disconnect();
  process.exit(0);
})().catch((e) => {
  console.error('THROWN:', e && e.stack);
  process.exit(3);
});
