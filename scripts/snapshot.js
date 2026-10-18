/**
 * 生成「官方榜单快照」并写入 miniprogram/data/snapshot.json
 *
 * 用途：不依赖云开发也能让小程序显示与 github.com/trending 完全一致的榜单。
 *       （接入云开发后把 config.js 的 MODE 改成 'cloud' 即转为实时）
 *
 * 用法：
 *   node scripts/snapshot.js            # 直连（云服务器 / 网络通畅时）
 *   SOCKS_PORT=10808 node scripts/snapshot.js   # 本机被墙时走 SOCKS5
 */
const fs = require('fs');
const path = require('path');

const SOCKS_PORT = process.env.SOCKS_PORT || '';
if (SOCKS_PORT) {
  // 复用测试用的 https 劫持（只在需要代理时启用）
  require('../.test/proxy-patch.js').install();
}

const ROOT = path.join(__dirname, '..');
const fn = require(path.join(ROOT, 'cloudfunctions', 'getTrending', 'index.js'));

// 人工中文对照表：有就优先用，没有再回落到官方英文描述
let ZH = {};
try {
  ZH = require(path.join(ROOT, 'data', 'zh.js'));
} catch (e) {
  console.warn('[zh] 未找到 data/zh.js，中文说明将缺失');
}

const PERIODS = ['daily', 'weekly', 'monthly'];

/** 30 天趋势：快照里没有历史，用本周期增量往回推一条估算曲线并打标 */
function synthTrend(stars, hot) {
  const span = 30;
  const total = hot || 0;
  const start = Math.max(0, stars - total);
  const out = [];
  for (let k = 0; k < span; k++) {
    const ratio = k / (span - 1);
    const wobble = Math.sin(k * 1.7) * 0.02 * total;
    out.push(Math.round(start + total * ratio + wobble));
  }
  out[span - 1] = stars;
  return out;
}

function toSnapshotItem(raw) {
  const trend = synthTrend(raw.stars, raw.hot);
  const desc = (raw.descEn || '').trim();
  const zh = ZH[raw.id] || null;
  return Object.assign({}, raw, {
    // 有中文用中文；没有就回落官方英文（前端会自动去掉重复的 EN 行）
    purpose: (zh && zh.purpose) || desc || '（这个项目没有填写描述）',
    detail:
      (zh && zh.detail) ||
      '这个项目还没整理中文说明。下面是它在 GitHub 上的官方描述原文，可点「打开 GitHub」进仓库了解。',
    tags: (zh && zh.tags) || [],
    trend: trend,
    trendEstimated: true,
    hasZh: !!(zh && zh.purpose)
  });
}

(async () => {
  const snapshot = {
    generatedAt: Date.now(),
    source: 'official-snapshot',
    languages: fn.__LANGUAGES,
    periods: {}
  };

  let allOk = true;

  for (const period of PERIODS) {
    process.stdout.write('抓取 ' + period + ' … ');
    try {
      const res = await fn.main({ period: period, language: '', skipZh: true });
      if (!res.ok) throw new Error(res.message || '返回失败');
      if (res.dataSource !== 'official') {
        console.warn('\n  ⚠️ dataSource=' + res.dataSource + '（不是 official，可能命中了 React 空壳）');
        allOk = false;
      }
      const items = res.items.map(toSnapshotItem);
      snapshot.periods[period] = items;
      console.log('OK  ' + items.length + ' 条  [' + res.dataSource + ']');
      items.slice(0, 3).forEach((it) => console.log('    #' + it.rank + ' ' + it.fullName + '  ★' + it.stars + ' +' + it.hot));
    } catch (e) {
      allOk = false;
      console.log('失败：' + e.message);
      snapshot.periods[period] = [];
    }
  }

  // 校验：三个周期都要有数据
  const empty = PERIODS.filter((p) => !snapshot.periods[p] || !snapshot.periods[p].length);
  if (empty.length) {
    console.error('\n❌ 以下周期没有数据，未写入快照：' + empty.join(', '));
    process.exit(1);
  }

  // 语言清单：用快照里实际出现的语言生成，保证筛选可用
  const seen = {};
  const langs = [{ name: '全部', value: '', color: '' }];
  PERIODS.forEach((p) => {
    snapshot.periods[p].forEach((it) => {
      if (!it.language || it.language === 'Unknown' || seen[it.language]) return;
      seen[it.language] = 1;
      const meta = fn.__LANGUAGES.filter((l) => l.name === it.language)[0];
      langs.push({
        name: it.language,
        value: meta ? meta.value : it.language.toLowerCase(),
        color: it.languageColor
      });
    });
  });
  snapshot.languages = langs;

  const outFile = path.join(ROOT, 'miniprogram', 'data', 'snapshot.js');
  // 输出成 JS 模块而不是 .json：小程序里 require 大 JSON 在部分基础库上不稳，
  // 而 module.exports 是确定能用的。
  const js = '/* 自动生成，勿手改：node scripts/snapshot.js */\nmodule.exports = ' +
    JSON.stringify(snapshot, null, 2) +
    ';\n';
  fs.writeFileSync(outFile, js, 'utf8');

  // 网页版数据：同一份内容，挂到 window 上（file:// 直接打开也能用，不受 fetch 限制）
  const webDir = path.join(ROOT, 'web', 'data');
  fs.mkdirSync(webDir, { recursive: true });
  const webFile = path.join(webDir, 'trending.js');
  fs.writeFileSync(
    webFile,
    '/* 自动生成，勿手改：node scripts/snapshot.js */\nwindow.TRENDING = ' +
      JSON.stringify(snapshot, null, 2) +
      ';\n',
    'utf8'
  );

  const size = fs.statSync(outFile).size;
  console.log('\n已写入 ' + outFile);
  console.log('已写入 ' + webFile);
  console.log('大小 ' + Math.round(size / 1024) + ' KB ｜ 语言 ' + (langs.length - 1) + ' 种 ｜ 生成时间 ' + new Date(snapshot.generatedAt).toLocaleString());

  process.exit(allOk ? 0 : 2);
})().catch((e) => {
  console.error('THROWN:', e && e.stack);
  process.exit(3);
});
