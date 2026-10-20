/**
 * 生成「官方榜单快照」并写入
 *   web/data/trending.js        （网页用，window.TRENDING）
 *   miniprogram/data/snapshot.js（小程序用，module.exports）
 * 同时维护历史库
 *   data/history.json           （名次变化 + 真实 star 曲线）
 *
 * 用法：
 *   node scripts/snapshot.js                     # 直连（CI 上就是这么跑）
 *   SOCKS_PORT=10808 node scripts/snapshot.js    # 本机被墙时走 SOCKS5
 */
const fs = require('fs');
const path = require('path');

const SOCKS_PORT = process.env.SOCKS_PORT || '';
if (SOCKS_PORT) {
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

const llm = require('./lib/llm.js');
const http = require('./lib/http.js');
const AUTO_FILE = path.join(ROOT, 'data', 'zh-auto.json');

/** AI 生成的中文缓存（会被 Actions 提交回仓库，所以同一条只花钱一次） */
let AUTO = { updatedAt: 0, model: llm.MODEL, entries: {} };
try {
  const raw = JSON.parse(fs.readFileSync(AUTO_FILE, 'utf8'));
  if (raw && raw.entries) AUTO = raw;
} catch (e) {
  /* 第一次跑：还没有缓存 */
}

/**
 * 取中文文案，优先级：人工对照表 > AI 缓存（未过期）> 无
 */
function pickZh(id) {
  const human = ZH[id];
  if (human && human.purpose) return { entry: human, source: 'manual' };

  const auto = AUTO.entries[id];
  if (auto && auto.purpose && llm.isFresh(auto, Date.now())) return { entry: auto, source: 'auto' };

  return { entry: null, source: 'none' };
}

const PERIODS = ['daily', 'weekly', 'monthly'];
const HISTORY_FILE = path.join(ROOT, 'data', 'history.json');
const KEEP_DAYS = 45;
const TREND_DAYS = 30;

const today = new Date().toISOString().slice(0, 10);

/* ---------------------------------------------------------------- 历史库 */

function loadHistory() {
  try {
    const raw = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    if (raw && Array.isArray(raw.days)) return raw;
  } catch (e) {
    /* 第一次跑：没有历史 */
  }
  return { days: [] };
}

/** 历史里「今天之前」最近的一天 */
function prevDayOf(history) {
  const older = history.days.filter((x) => x.d < today).sort((a, b) => (a.d < b.d ? 1 : -1));
  return older[0] || null;
}

/**
 * 名次变化：上一名的名次 - 当前名次
 *   正数 = 上升；负数 = 下降；上一版不存在 = 新上榜；没有上一版 = 无数据
 */
function rankDelta(prevDay, period, id, currentRank) {
  if (!prevDay || !prevDay.ranks || !prevDay.ranks[period]) return { rankChange: null, isNew: false };
  const list = prevDay.ranks[period];
  const idx = list.indexOf(id);
  if (idx === -1) return { rankChange: null, isNew: true };
  return { rankChange: idx + 1 - currentRank, isNew: false };
}

/**
 * 真实 star 曲线：把历史里出现过的点按日期排好，缺口用前值填充，
 * 不足 30 天就在前面回推补足（这部分是估算，会被标记）。
 *
 * 回推速率：
 *   有 ≥2 个真实点 → 用首末差 / 天数
 *   只有 1 个真实点 → 用该周期的 hot（页面上的「N stars today/week/month」）÷ 周期天数
 *   两者都没有     → 0（只能画成水平线，这是最诚实的结果）
 */
/**
 * Star 走势：只存【真实记录】。
 *
 * 早期版本会用「日均增量 × 衰减」把不足 30 天的部分补成 30 个点，
 * 结果每个仓库的曲线形状几乎一样（同一个公式），还把估算当成涨幅报出来
 * （实测两天涨 1,948，标题报 +53,521）。现在不再造数据：
 * 有几天就存几天，前端也据此显示「近 N 天（全部真实）」。
 */
function trendOf(history, id, currentStars) {
  const values = [];
  history.days
    .filter((day) => day.d !== today)
    .forEach((day) => {
      const v = day.stars && day.stars[id];
      if (typeof v === 'number') values.push(v);
    });
  values.push(currentStars);

  const trend = values.slice(-TREND_DAYS);
  return { trend: trend, realPoints: trend.length };
}
/* ---------------------------------------------------------------- 条目 */

function toSnapshotItem(raw, extra) {
  const desc = (raw.descEn || '').trim();
  const picked = pickZh(raw.id);
  const zh = picked.entry;
  const t = trendOf(extra.history, raw.id, raw.stars);
  return Object.assign({}, raw, {
    purpose: (zh && zh.purpose) || desc || '（这个项目没有填写描述）',
    detail:
      (zh && zh.detail) ||
      '这个项目还没整理中文说明。下面是它在 GitHub 上的官方描述原文，可点「打开 GitHub」进仓库了解。',
    tags: (zh && zh.tags) || [],
    trend: t.trend,
    trendEstimated: t.realPoints < TREND_DAYS,
    trendRealPoints: t.realPoints,
    rankChange: extra.rankChange,
    isNew: extra.isNew,
    hasZh: !!(zh && zh.purpose),
    zhSource: zh ? picked.source : 'none' // manual | auto | none
  });
}

/** AI 生成结果回填到已构建的条目上 */
function applyAuto(items, entry) {
  items.forEach(function (it) {
    if (it.id !== entry.id) return;
    it.purpose = entry.text.purpose;
    it.detail = entry.text.detail;
    it.tags = entry.text.tags;
    it.hasZh = true;
    it.zhSource = 'auto';
  });
}

/* ---- 无描述的仓库：抓 README 当素材，否则只能生成「信息不足」 ---- */
async function fetchReadmeExcerpt(owner, repo) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  const headers = { Accept: 'application/vnd.github.raw', 'User-Agent': 'ght-trending' };
  if (token) headers.Authorization = 'Bearer ' + token;
  try {
    const apiBase = process.env.GH_API_BASE || 'https://api.github.com';
    const res = await http.request(
      'GET',
      apiBase + '/repos/' + owner + '/' + repo + '/readme',
      headers
    );
    if (res.status !== 200) return '';
    // 只取前 1200 字：够模型判断用途，又不至于把 prompt 撑大
    const text = String(res.body)
      .replace(/\r/g, '')
      .replace(/```[\s\S]*?```/g, ' ')      // 去掉代码块
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // 去掉图片
      .replace(/<[^>]+>/g, ' ')              // 去掉 HTML
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{2,}/g, '\n')
      .trim();
    return text.slice(0, 1200);
  } catch (e) {
    return '';
  }
}

/* ---------------------------------------------------------------- 主流程 */

async function run() {
  const history = loadHistory();
  const prevDay = prevDayOf(history);

  const snapshot = {
    generatedAt: Date.now(),
    date: today,
    source: 'official-snapshot',
    historyDays: 0, // 写完历史库后再回填真实天数
    hasPrevDay: !!prevDay,
    prevDate: prevDay ? prevDay.d : null,
    languages: fn.__LANGUAGES,
    periods: {}
  };

  const dayRecord = { d: today, stars: {}, ranks: {} };
  let allOk = true;

  for (const period of PERIODS) {
    process.stdout.write('抓取 ' + period + ' … ');
    try {
      const res = await fn.main({ period: period, language: '', skipZh: true });
      if (!res.ok) throw new Error(res.message || '返回失败');
      if (res.dataSource !== 'official') {
        console.warn('\n  ⚠️ dataSource=' + res.dataSource + '（不是 official，可能命中 React 空壳）');
        allOk = false;
      }

      const items = res.items.map((raw) => {
        const delta = rankDelta(prevDay, period, raw.id, raw.rank);
        dayRecord.stars[raw.id] = raw.stars;
        return toSnapshotItem(raw, {
          history: history,
          rankChange: delta.rankChange,
          isNew: delta.isNew
        });
      });

      dayRecord.ranks[period] = items.map((i) => i.id);
      snapshot.periods[period] = items;

      const moved = items.filter((i) => i.rankChange != null && i.rankChange !== 0).length;
      const fresh = items.filter((i) => i.isNew).length;
      console.log(
        'OK  ' + items.length + ' 条  [' + res.dataSource + ']' +
        (prevDay ? '  ↑↓' + moved + ' 新' + fresh : '  （首次快照，无对比基准）')
      );
      items.slice(0, 3).forEach((it) => {
        const flag = it.isNew ? ' NEW' : it.rankChange != null ? ' ' + (it.rankChange > 0 ? '↑' + it.rankChange : it.rankChange < 0 ? '↓' + Math.abs(it.rankChange) : '—') : '';
        console.log('    #' + it.rank + ' ' + it.fullName + '  ★' + it.stars + ' +' + it.hot + flag);
      });
    } catch (e) {
      allOk = false;
      console.log('失败：' + e.message);
      snapshot.periods[period] = [];
    }
  }

  const empty = PERIODS.filter((p) => !snapshot.periods[p] || !snapshot.periods[p].length);
  if (empty.length) {
    console.error('\n❌ 以下周期没有数据，未写入：' + empty.join(', '));
    return 1;
  }

  /* ---- AI 补齐中文：只对人工表里没有的条目调一次，结果缓存进 data/zh-auto.json ---- */
  const apiKey = process.env.DEEPSEEK_API_KEY || '';
  const seenIds = {};
  const missing = [];
  PERIODS.forEach(function (p) {
    (snapshot.periods[p] || []).forEach(function (it) {
      if (seenIds[it.id] || it.zhSource !== 'none') return;
      seenIds[it.id] = 1;
      missing.push({ id: it.id, fullName: it.fullName, language: it.language, descEn: it.descEn, topics: it.tags });
    });
  });

  // 缓存里存的是「信息不足」的旧条目：当时没有 README 素材，现在重试一次
  Object.keys(AUTO.entries).forEach(function (id) {
    const e = AUTO.entries[id];
    if (e && typeof e.purpose === 'string' && e.purpose.indexOf('信息不足') > -1 && !ZH[id]) {
      delete AUTO.entries[id];
      console.log('  ↻ 清掉旧的「信息不足」缓存：' + id);
    }
  });

  // 没有官方描述的仓库，先抓 README 当素材（否则模型只能写「信息不足」）
  for (const item of missing) {
    if (item.descEn && item.descEn.trim()) continue;
    const parts = String(item.id).split('/');
    if (parts.length !== 2) continue;
    item.readmeExcerpt = await fetchReadmeExcerpt(parts[0], parts[1]);
    if (item.readmeExcerpt) {
      console.log('  📄 取到 README：' + item.id + '（' + item.readmeExcerpt.length + ' 字符）');
    }
  }

  snapshot.zhMissing = missing.length;
  snapshot.zhAi = 0;

  if (!missing.length) {
    console.log('\n[zh] 榜单中文已全覆盖，无需调用模型');
  } else if (!apiKey) {
    console.log('\n[zh] 缺 ' + missing.length + ' 条中文，但未配置 DEEPSEEK_API_KEY，本次跳过（页面显示英文原文）');
  } else {
    const limit = Number(process.env.ZH_MAX_PER_RUN || 12);
    console.log('\n[zh] 缺 ' + missing.length + ' 条中文，本次最多生成 ' + limit + ' 条（模型 ' + llm.MODEL + '）');
    const result = await llm.generateMany(apiKey, missing, {
      limit: limit,
      onResult: function (item, entry, err) {
        if (err) {
          console.log('    ✗ ' + item.id + '：' + err.message);
          return;
        }
        AUTO.entries[item.id] = entry;
        PERIODS.forEach(function (p) {
          applyAuto(snapshot.periods[p] || [], { id: item.id, text: entry });
        });
        snapshot.zhAi++;
        console.log('    ✓ ' + item.id + ' → ' + entry.purpose);
      }
    });
    if (result.skipped) console.log('    （还有 ' + result.skipped + ' 条留到下次运行）');
    if (snapshot.zhAi) {
      AUTO.updatedAt = Date.now();
      AUTO.model = llm.MODEL;
      fs.writeFileSync(AUTO_FILE, JSON.stringify(AUTO, null, 2), 'utf8');
      console.log('    已写入 ' + AUTO_FILE + '（累计缓存 ' + Object.keys(AUTO.entries).length + ' 条）');
    }
  }

  /* ---- 语言清单：按当天实际出现的语言生成 ---- */
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

  /* ---- 更新历史库：同一天覆盖，超过 45 天裁掉 ---- */
  const days = history.days.filter((x) => x.d !== today);
  days.push(dayRecord);
  days.sort((a, b) => (a.d < b.d ? -1 : 1));

  const pruned = days.filter((x) => (Date.now() - new Date(x.d + 'T00:00:00Z').getTime()) / 86400000 <= KEEP_DAYS);
  const outHistory = { updatedAt: Date.now(), keepDays: KEEP_DAYS, days: pruned };
  snapshot.historyDays = pruned.length;
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(outHistory, null, 2), 'utf8');

  /* ---- 写产物 ---- */
  const body = JSON.stringify(snapshot, null, 2);

  const mpFile = path.join(ROOT, 'miniprogram', 'data', 'snapshot.js');
  fs.writeFileSync(mpFile, '/* 自动生成，勿手改：node scripts/snapshot.js */\nmodule.exports = ' + body + ';\n', 'utf8');

  const webDir = path.join(ROOT, 'web', 'data');
  fs.mkdirSync(webDir, { recursive: true });
  const webFile = path.join(webDir, 'trending.js');
  fs.writeFileSync(webFile, '/* 自动生成，勿手改：node scripts/snapshot.js */\nwindow.TRENDING = ' + body + ';\n', 'utf8');

  console.log('\n已写入 ' + mpFile);
  console.log('已写入 ' + webFile);
  console.log('已写入 ' + HISTORY_FILE + '（' + pruned.length + ' 天）');


  console.log(
    '大小 ' + Math.round(fs.statSync(webFile).size / 1024) + ' KB ｜ 语言 ' + (langs.length - 1) + ' 种 ｜ ' +
    (prevDay ? '对比基准 ' + prevDay.d : '首次快照（明天起会有升降标记）')
  );

  return allOk ? 0 : 2;
}

if (require.main === module) {
  run()
    .then(function (code) {
      process.exit(code);
    })
    .catch(function (e) {
      console.error('THROWN:', e && e.stack);
      process.exit(3);
    });
}

// 纯函数供单测使用（不联网、不写文件）
module.exports = {
  rankDelta: rankDelta,
  trendOf: trendOf,
  fetchReadmeExcerpt: fetchReadmeExcerpt,
  TREND_DAYS: TREND_DAYS
};









