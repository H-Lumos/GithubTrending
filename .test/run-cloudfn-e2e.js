/**
 * 云函数 getTrending 端到端验证：
 *   劫持 https → 本地 SOCKS5，让云函数用真 GitHub 数据跑完整流程
 *   （抓取 → 解析 → 中文缓存/兜底 → 趋势 → 名次对比），数据库用内存桩。
 * 并把你截图里的官方榜单作为期望值逐条比对。
 * 用法：node .test/run-cloudfn-e2e.js
 */
const path = require('path');
const assert = require('assert');

require('./proxy-patch.js').install();

const sdk = require('wx-server-sdk'); // .test/node_modules 里的内存版
const fn = require(path.join(__dirname, '..', 'cloudfunctions', 'getTrending', 'index.js'));

// ---- 你提供的官方榜单（已按实际 owner 名校正 OCR 误读）----
const EXPECT = {
  daily: [
    'anthropics/claude-plugins-official',
    'MadsLorentzen/ai-job-search',
    'affaan-m/ECC',
    'HKUDS/CLI-Anything',
    'K-Dense-AI/scientific-agent-skills',
    'akitaonrails/ai-memory',
    'android/skills',
    'stablyai/orca',
    'anthropics/claude-code',
    'debpalash/VoiceStudio',
    'anomalyco/opencode',
    'ruvnet/ruflo',
    'xerj-org/xerj'
  ],
  weekly: [
    'morluto/rea',
    'storytold/artcraft',
    'boykopovar/AnyPS5',
    'cathrynlavery/diagram-design',
    'anthropics/claude-plugins-official',
    'heygen-com/hyperframes',
    'mksglu/context-mode',
    'NationalSecurityAgency/ghidra',
    'mattpocock/skills',
    'ranxianglei/billion-context'
  ],
  monthly: [
    'cloudflare/security-audit-skill',
    'paperclipai/paperclip',
    'anthropics/financial-services',
    'heygen-com/hyperframes',
    'debpalash/VoiceStudio',
    'vectorize-io/hindsight',
    'agent-substrate/substrate',
    'affaan-m/ECC',
    'mksglu/context-mode',
    'anthropics/knowledge-work-plugins',
    'NVIDIA/OpenShell',
    'tashfeenahmed/freellmapi',
    'NationalSecurityAgency/ghidra',
    'TencentCloud/Octop',
    'trycua/cua',
    'rohitg00/ai-engineering-from-scratch',
    'cursor/plugins',
    'addyosmani/agent-skills',
    'longbridge/gpui-kit',
    'Tencent/WeKnora',
    'anthropics/claude-code'
  ]
};

const EXPECT_COUNT = { daily: 13, weekly: 10, monthly: 21 };

function norm(s) {
  return String(s || '').toLowerCase();
}

(async () => {
  let allOk = true;

  for (const period of ['daily', 'weekly', 'monthly']) {
    console.log('\n================ ' + period.toUpperCase() + ' ================');
    const res = await fn.main({ period: period, language: '', skipZh: true });
    if (!res.ok) {
      console.log('❌ 云函数返回失败：', res.message);
      allOk = false;
      continue;
    }

    const items = res.items;
    console.log('dataSource =', res.dataSource, '| 条数 =', items.length, '（期望 ' + EXPECT_COUNT[period] + '）');

    const okCount = items.length === EXPECT_COUNT[period];
    console.log((okCount ? '  ✓' : '  ✗') + ' 条数与 GitHub 一致');
    if (!okCount) allOk = false;

    // 逐条比对
    const exp = EXPECT[period];
    let hit = 0;
    exp.forEach((name, i) => {
      const got = items[i] ? items[i].fullName : '(缺)';
      const same = norm(got) === norm(name);
      if (same) hit++;
      console.log('  ' + (same ? '✓' : '✗') + ' #' + (i + 1) + ' 期望 ' + name + '  实际 ' + got);
    });
    console.log('  名次匹配 ' + hit + '/' + exp.length);
    if (hit !== exp.length) allOk = false;

    // 数据完整性抽查（前 3 条要有 hot / 描述 / 语言色）
    const head = items.slice(0, 3);
    const sane = head.every((i) => i.hot > 0 && i.language && i.stars > 0);
    console.log('  ' + (sane ? '✓' : '✗') + ' 前 3 条 hot/语言/star 完整');
    if (!sane) allOk = false;

    // 中文兜底：skipZh 模式下应回落到英文原文，不应为空
    const zhOk = items.every((i) => i.purpose && i.detail);
    console.log('  ' + (zhOk ? '✓' : '✗') + ' 每条都有 purpose/detail（skipZh 下回落英文原文）');
    if (!zhOk) allOk = false;

    // 打印完整榜单，便于人工对照
    console.log('\n  --- 完整榜单 ---');
    items.forEach((it) => {
      console.log('  ' + String(it.rank).padStart(2) + '. ' + it.fullName +
        '  ★' + it.stars + '  +' + it.hot +
        '  [' + it.language + ']  trend=' + (it.trend ? it.trend.length : 0));
    });

    // 存入内存库，验证 star_history 写入路径（模拟 syncStars 的一部分）
    for (const it of items.slice(0, 3)) {
      await sdk.database().collection('star_history').add({
        data: { id: it.id, d: '2026-10-18', stars: it.stars, ts: Date.now() }
      });
    }
    const stored = sdk.__dump('star_history');
    console.log('  内存库 star_history 写入 ' + stored.length + ' 条');
  }

  console.log('\n================ 结论 ================');
  console.log(allOk ? '✅ 全部与 GitHub 官方榜单一致' : '❌ 存在差异，见上方 ✗');
  process.exit(allOk ? 0 : 2);
})().catch((e) => {
  console.error('THROWN:', e && e.stack);
  process.exit(3);
});
