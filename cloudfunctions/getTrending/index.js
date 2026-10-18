/**
 * 云函数 getTrending
 * ---------------------------------------------------------------------------
 * 双通道取数（关键设计）
 *
 *   通道 A｜官方 trending HTML（优先）
 *      GET https://github.com/trending[/语言]?since=daily|weekly|monthly
 *      解析 <article class="Box-row">：仓库名、描述、语言、star/fork 总数、
 *      「N stars today/this week/this month」、Built by 头像。
 *      优点：严格等于官方榜单顺序，增量是页面上的真实值。
 *      注意：GitHub 存在两种渲染变体——无 cookie 首访有时会返回 React 空壳
 *            （HTML 里没有 Box-row）。所以解析出 < 5 条就判定失败，转通道 B。
 *
 *   通道 B｜官方 Search API（兜底）
 *      created:>=窗口 + stars 排序，按「平均每天涨星」折算本周期新增。
 *      优点：接口文档化、结构稳定；缺点：不是官方榜单原始顺序。
 *
 *   响应里每条都带 dataSource: 'official' | 'search' | 'api'，前端/排查一眼能分辨。
 *
 *   详情页走 /repos/{owner}/{repo}（单次请求），拿不到官方名次时 rank=0。
 *
 * 为什么必须走云函数：小程序 wx.request 只能访问已登记域名，api.github.com /
 * github.com 无法登记，由云函数（可自由出网）代理。
 */
const https = require('https');

// 云开发 SDK 允许缺席：缺席时（比如本地脚本生成快照）数据库相关分支会优雅降级，
// 抓取、解析、归一化这些纯逻辑仍可复用。
let cloud = null;
let db = null;
let _ = null;
try {
  cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
  db = cloud.database();
  _ = db.command;
} catch (e) {
  console.warn('[env] 未检测到 wx-server-sdk，数据库功能关闭（仅抓取/解析可用）');
}

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/**
 * 语言清单
 *   value = 前端筛选用的小写标识（存在小程序 storage / URL 里）
 *   slug  = GitHub trending 路径里用的真实写法（c++ 要编码成 c%2B%2B）
 */
const LANGUAGES = [
  { name: '全部', value: '', slug: '', color: '' },
  { name: 'Python', value: 'python', slug: 'python', color: '#3572A5' },
  { name: 'TypeScript', value: 'typescript', slug: 'typescript', color: '#3178c6' },
  { name: 'JavaScript', value: 'javascript', slug: 'javascript', color: '#f1e05a' },
  { name: 'Go', value: 'go', slug: 'go', color: '#00ADD8' },
  { name: 'Rust', value: 'rust', slug: 'rust', color: '#dea584' },
  { name: 'C++', value: 'cpp', slug: 'c++', color: '#f34b7d' },
  { name: 'C#', value: 'csharp', slug: 'c%23', color: '#178600' },
  { name: 'Java', value: 'java', slug: 'java', color: '#b07219' },
  { name: 'Shell', value: 'shell', slug: 'shell', color: '#89e051' },
  { name: 'Svelte', value: 'svelte', slug: 'svelte', color: '#ff3e00' },
  { name: 'Vue', value: 'vue', slug: 'vue', color: '#41b883' },
  { name: 'Jupyter Notebook', value: 'jupyter-notebook', slug: 'jupyter-notebook', color: '#DA5B0B' }
];

const COLOR_BY_NAME = {};
const META_BY_VALUE = {};
LANGUAGES.forEach(function (l) {
  if (!l.value) return;
  COLOR_BY_NAME[l.name] = l.color;
  META_BY_VALUE[l.value] = l;
});

/* ------------------------------------------------------------------ */
/* 基础工具                                                             */
/* ------------------------------------------------------------------ */

function httpGet(url, headers, depth) {
  depth = depth || 0;
  return new Promise(function (resolve, reject) {
    const req = https.get(url, { headers: headers || {} }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && depth < 5) {
        res.resume();
        const next = /^https?:\/\//.test(res.headers.location)
          ? res.headers.location
          : new URL(res.headers.location, url).toString();
        httpGet(next, headers, depth + 1).then(resolve, reject);
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', function (c) {
        data += c;
      });
      res.on('end', function () {
        resolve({ status: res.statusCode, body: data });
      });
    });
    req.on('error', reject);
    req.setTimeout(12000, function () {
      req.destroy(new Error('request timeout'));
    });
  });
}

function httpPostJson(url, payload, headers) {
  return new Promise(function (resolve, reject) {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: Object.assign(
          { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
          headers || {}
        )
      },
      function (res) {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', function (c) {
          data += c;
        });
        res.on('end', function () {
          if (res.statusCode >= 400) {
            reject(new Error('LLM HTTP ' + res.statusCode + ': ' + data.slice(0, 200)));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('LLM 返回非 JSON'));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(20000, function () {
      req.destroy(new Error('llm timeout'));
    });
    req.write(body);
    req.end();
  });
}

function dayStr(offsetDays) {
  const d = new Date(Date.now() + (offsetDays || 0) * 86400000);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
}

/** 周期对应的天数与观察窗口（天） */
const PERIOD_META = {
  daily: { unitDays: 1, window: 10, minStars: 20, label: '今日', since: 'daily' },
  weekly: { unitDays: 7, window: 30, minStars: 60, label: '本周', since: 'weekly' },
  monthly: { unitDays: 30, window: 90, minStars: 150, label: '本月', since: 'monthly' }
};

/* ------------------------------------------------------------------ */
/* 通道 A：官方 trending HTML 解析                                      */
/* ------------------------------------------------------------------ */

function decodeEntities(s) {
  if (!s) return '';
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toInt(s) {
  if (!s) return 0;
  const n = parseInt(String(s).replace(/[^\d]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

/**
 * 解析官方 trending 页面（经典 Box-row 标记）
 * 纯函数，便于用 fixture 做单元测试
 */
function parseOfficialTrending(html, period) {
  const out = [];
  if (!html || typeof html !== 'string') return out;

  const chunks = html.split('<article class="Box-row"');

  for (let i = 1; i < chunks.length; i++) {
    const b = chunks[i];

    // 仓库名：h2 里的第一个 href="/owner/repo"
    const h2 = b.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
    if (!h2) continue;
    const href = h2[1].match(/href="\/([^"?#]+)"/);
    if (!href) continue;

    const fullName = href[1];
    const seg = fullName.split('/');
    if (seg.length !== 2 || !seg[0] || !seg[1]) continue;

    // 描述
    const descM = b.match(/<p[^>]*class="[^"]*col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/);
    const descEn = descM ? decodeEntities(descM[1]) : '';

    // 语言 + 页面上的语言色点（比本地色表更准）
    // GitHub 的标记有三种变体，逐级兜底，否则会退化成 Unknown
    let language = '';
    const langM = b.match(/itemprop="programmingLanguage"[^>]*>([^<]+)</);
    if (langM) language = decodeEntities(langM[1]).trim();

    if (!language) {
      // 变体 B：有语言色点，但语言名跟在 </span> 后面，没有 itemprop
      const m2 = b.match(
        /repo-language-color[^>]*>[\s\S]{0,60}?<\/span>\s*([A-Za-z][A-Za-z0-9+#.\- ]{1,30}?)\s*</
      );
      if (m2) language = m2[1].trim();
    }

    if (!language) {
      // 变体 C：整块 d-inline-block ml-0 mr-3 里只有纯文本
      const m3 = b.match(/<span class="[^"]*h4 mr-3[^"]*">([\s\S]{0,200}?)<\/span>/);
      if (m3) {
        const txt = decodeEntities(m3[1].replace(/<[^>]*>/g, ' '))
          .replace(/\s+/g, ' ')
          .trim();
        if (/^[A-Za-z][A-Za-z0-9+#.\- ]{1,30}$/.test(txt)) language = txt;
      }
    }

    const colorM =
      b.match(/repo-language-color[^>]*style="[^"]*background-color:\s*(#[0-9a-fA-F]{3,6})/) ||
      b.match(/background-color:\s*(#[0-9a-fA-F]{3,6})/);
    const languageColor = (colorM && colorM[1]) || COLOR_BY_NAME[language] || '#8b949e';

    // star / fork 总数
    const starM = b.match(/\/stargazers"[^>]*>([\s\S]*?)<\/a>/);
    const forkM = b.match(/\/forks"[^>]*>([\s\S]*?)<\/a>/);
    const stars = starM ? toInt(decodeEntities(starM[1])) : 0;
    const forks = forkM ? toInt(decodeEntities(forkM[1])) : 0;

    // 本周期新增（页面上直接写着 "1,397 stars today"）
    const hotM = b.match(/([\d,]+)\s+stars\s+(today|this week|this month)/i);
    const hot = hotM ? toInt(hotM[1]) : 0;

    // Built by 头像（前 5 个）
    const avatars = [];
    const builtBy = b.split('Built by')[1];
    if (builtBy) {
      const imgRe = /<img[^>]+src="([^"]+)"/g;
      let m;
      let n = 0;
      while ((m = imgRe.exec(builtBy)) && n < 5) {
        avatars.push(m[1]);
        n++;
      }
    }

    out.push({
      id: fullName,
      owner: seg[0],
      repo: seg[1],
      fullName: fullName,
      url: 'https://github.com/' + fullName,
      descEn: descEn,
      language: language || 'Unknown',
      languageColor: languageColor,
      stars: stars,
      forks: forks,
      hot: hot,
      hotUnit: (PERIOD_META[period] || PERIOD_META.daily).label + '新增',
      avatars: avatars,
      topics: [],
      license: '',
      initial: (seg[1][0] || '?').toUpperCase(),
      rank: 0,
      dataSource: 'official'
    });
  }

  return out.map(function (it, idx) {
    return Object.assign({}, it, { rank: idx + 1 });
  });
}

async function fetchOfficial(period, language) {
  const meta = PERIOD_META[period] || PERIOD_META.daily;
  const langMeta = META_BY_VALUE[language];
  let url = 'https://github.com/trending';
  if (langMeta && langMeta.slug) url += '/' + langMeta.slug;
  url += '?since=' + meta.since;

  const res = await httpGet(url, {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache'
  });

  if (res.status !== 200) {
    throw new Error('trending 页面返回 HTTP ' + res.status);
  }
  return res.body;
}

/* ------------------------------------------------------------------ */
/* 通道 B：Search API                                                   */
/* ------------------------------------------------------------------ */

async function searchRepos(q, perPage) {
  const url =
    'https://api.github.com/search/repositories?q=' +
    encodeURIComponent(q) +
    '&sort=stars&order=desc&per_page=' +
    (perPage || 30);

  const headers = { 'User-Agent': UA, Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;

  const res = await httpGet(url, headers);
  if (res.status === 403 || res.status === 429) {
    throw new Error('GitHub 搜索接口限流（403/429），请在云函数环境变量里配置 GITHUB_TOKEN');
  }
  if (res.status !== 200) {
    throw new Error('GitHub 搜索接口返回 HTTP ' + res.status);
  }
  try {
    return JSON.parse(res.body);
  } catch (e) {
    throw new Error('GitHub 搜索接口返回非 JSON');
  }
}

/** 单仓库详情：分享链接进来时只需 1 次请求 */
async function getRepo(fullName) {
  const url = 'https://api.github.com/repos/' + fullName;
  const headers = { 'User-Agent': UA, Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = 'Bearer ' + process.env.GITHUB_TOKEN;

  const res = await httpGet(url, headers);
  if (res.status === 404) return null;
  if (res.status === 403 || res.status === 429) {
    throw new Error('GitHub 接口限流（403/429），请配置 GITHUB_TOKEN');
  }
  if (res.status !== 200) throw new Error('GitHub 仓库接口返回 HTTP ' + res.status);
  try {
    return JSON.parse(res.body);
  } catch (e) {
    throw new Error('GitHub 仓库接口返回非 JSON');
  }
}

/**
 * 把 Search API 的 JSON 转成小程序需要的结构（纯函数）
 * 核心指标：按「平均每天涨星」估算本周期新增
 */
function normalizeSearch(json, period) {
  const meta = PERIOD_META[period] || PERIOD_META.daily;
  const list = (json && json.items) || [];
  const now = Date.now();

  return list.map(function (r) {
    const seg = (r.full_name || '').split('/');
    const owner = seg[0] || '';
    const repo = seg[1] || '';
    const stars = r.stargazers_count || 0;

    let ageDays = 1;
    if (r.created_at) {
      ageDays = Math.max(1, Math.round((now - new Date(r.created_at).getTime()) / 86400000));
    }

    const perDay = stars / ageDays;
    let hot = Math.round(perDay * meta.unitDays);
    if (hot < 1) hot = 1;
    if (hot > stars) hot = stars;

    const topics = Array.isArray(r.topics) ? r.topics.slice(0, 4) : [];
    const langName = r.language || 'Unknown';

    return {
      id: r.full_name,
      owner: owner,
      repo: repo,
      fullName: r.full_name,
      url: r.html_url || 'https://github.com/' + r.full_name,
      descEn: (r.description || '').replace(/\s+/g, ' ').trim(),
      language: langName,
      languageColor: COLOR_BY_NAME[langName] || '#8b949e',
      stars: stars,
      forks: r.forks_count || 0,
      hot: hot,
      hotUnit: meta.label + '新增',
      createdAt: r.created_at || '',
      license: (r.license && r.license.spdx_id) || '',
      topics: topics,
      avatars: [],
      initial: (repo[0] || '?').toUpperCase(),
      rank: 0,
      dataSource: 'search'
    };
  });
}

async function searchFallback(period, language) {
  const meta = PERIOD_META[period] || PERIOD_META.daily;
  const langMeta = META_BY_VALUE[language];
  const langName = langMeta ? langMeta.name : language;
  const langQ = langName ? ' language:"' + langName + '"' : '';

  const q1 = 'created:>=' + dayStr(-meta.window) + ' stars:>=' + meta.minStars + langQ;
  let items = normalizeSearch(await searchRepos(q1, 40), period);

  if (items.length < 12) {
    try {
      const q2 = 'stars:>=20000 pushed:>=' + dayStr(-7) + langQ;
      const extra = normalizeSearch(await searchRepos(q2, 25), period);
      items = items.concat(extra);
    } catch (e) {
      console.warn('[search] fallback skipped', e.message);
    }
  }
  return items;
}

/* ------------------------------------------------------------------ */
/* 中文用途：缓存优先 → 模型生成 → 原文兜底                              */
/* ------------------------------------------------------------------ */

function zhDocId(id) {
  return id.replace(/[\/\\]/g, '__');
}

const SYSTEM_PROMPT =
  '你是资深开源项目编辑，服务对象是中文开发者。' +
  '给你一个 GitHub 仓库的名字、主语言、官方英文描述和话题标签，' +
  '你要用中文说清「它是做什么的、给谁用、解决什么问题」。' +
  '不要写成营销文案，不要复述英文，不要臆造官方描述里没有的能力。只输出 JSON。';

async function generateZh(item) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;

  const user =
    '仓库：' + item.fullName +
    '\n主语言：' + item.language +
    '\n话题：' + (item.topics && item.topics.length ? item.topics.join(', ') : '（无）') +
    '\n官方描述：' + (item.descEn || '（无描述）') +
    '\n\n请输出 JSON：{"purpose":"不超过 40 字的中文一句话用途","detail":"80~160 字中文说明，讲清使用场景","tags":["3~4 个中文标签"]}';

  try {
    const res = await httpPostJson(
      process.env.LLM_BASE_URL || 'https://api.deepseek.com/chat/completions',
      {
        model: process.env.LLM_MODEL || 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: user }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      },
      { Authorization: 'Bearer ' + key }
    );

    const text = res && res.choices && res.choices[0] && res.choices[0].message.content;
    if (!text) return null;

    const obj = JSON.parse(text);
    if (!obj || !obj.purpose) return null;

    return {
      purpose: String(obj.purpose).slice(0, 80),
      detail: String(obj.detail || obj.purpose).slice(0, 400),
      tags: Array.isArray(obj.tags) ? obj.tags.slice(0, 4).map(String) : []
    };
  } catch (e) {
    console.warn('[zh] generate failed', item.fullName, e.message);
    return null;
  }
}

async function attachZh(items, opts) {
  opts = opts || {};
  const ttlDays = Number(process.env.ZH_TTL_DAYS || 60);
  const now = Date.now();
  const map = {};
  const ids = items.map(function (i) {
    return zhDocId(i.id);
  });

  try {
    const r = await db.collection('repo_zh').where({ _id: _.in(ids) }).limit(100).get();
    (r.data || []).forEach(function (d) {
      map[d._id] = d;
    });
  } catch (e) {
    console.warn('[zh] cache read failed', e.message);
  }

  // 命中且未过期 = 可直接复用；过期条目仍先用旧文案兜底显示，同时排队重生成
  function isFresh(doc) {
    if (!doc || !doc.updatedAt) return false;
    return now - Number(doc.updatedAt) < ttlDays * 86400000;
  }

  const missing = items.filter(function (i) {
    return !isFresh(map[zhDocId(i.id)]);
  });

  const limit = opts.skipZh ? 0 : 8;
  for (let k = 0; k < missing.length && k < limit; k++) {
    const item = missing[k];
    const zh = await generateZh(item);
    if (!zh) continue;
    map[zhDocId(item.id)] = Object.assign({}, zh, {
      fullName: item.fullName,
      updatedAt: Date.now()
    });
    try {
      await db
        .collection('repo_zh')
        .doc(zhDocId(item.id))
        .set({
          data: {
            fullName: item.fullName,
            purpose: zh.purpose,
            detail: zh.detail,
            tags: zh.tags,
            updatedAt: Date.now()
          }
        });
    } catch (e) {
      console.warn('[zh] cache write failed', e.message);
    }
  }

  return items.map(function (i) {
    const zh = map[zhDocId(i.id)] || null;
    return Object.assign({}, i, {
      purpose: zh && zh.purpose ? zh.purpose : i.descEn || '（这个项目没有填写描述）',
      detail:
        zh && zh.detail
          ? zh.detail
          : '还没有中文说明。GitHub 上的原始描述：' + (i.descEn || '（空）'),
      tags:
        zh && zh.tags && zh.tags.length
          ? zh.tags
          : i.topics && i.topics.length
          ? i.topics
          : [i.language].filter(Boolean)
    });
  });
}

/* ------------------------------------------------------------------ */
/* Star 历史（自建快照）                                                 */
/* ------------------------------------------------------------------ */

async function attachTrend(items, period) {
  const ids = items.map(function (i) {
    return i.id;
  });

  const byRepo = {};
  try {
    const r = await db
      .collection('star_history')
      .where({ id: _.in(ids), d: _.gte(dayStr(-30)) })
      .orderBy('d', 'asc')
      .limit(1000)
      .get();
    (r.data || []).forEach(function (row) {
      if (!byRepo[row.id]) byRepo[row.id] = [];
      byRepo[row.id].push(row);
    });
  } catch (e) {
    console.warn('[trend] read failed', e.message);
  }

  return items.map(function (i) {
    const rows = byRepo[i.id] || [];
    let trend = rows.map(function (r) {
      return Number(r.stars) || 0;
    });
    let estimated = false;

    if (trend.length < 3) {
      estimated = true;
      const span = 30;
      const total = i.hot || 0;
      const start = Math.max(0, i.stars - total);
      trend = [];
      for (let k = 0; k < span; k++) {
        const ratio = k / (span - 1);
        const wobble = Math.sin(k * 1.7) * 0.02 * total;
        trend.push(Math.round(start + total * ratio + wobble));
      }
      trend[span - 1] = i.stars;
    }

    return Object.assign({}, i, { trend: trend, trendEstimated: estimated });
  });
}

/* ------------------------------------------------------------------ */
/* 榜单位置变化（新上榜 / 上升 / 下降）                                  */
/* ------------------------------------------------------------------ */

function computeRankDiff(prevIds, items) {
  const hasPrev = Array.isArray(prevIds) && prevIds.length > 0;
  const prevRank = {};
  if (hasPrev) {
    prevIds.forEach(function (id, idx) {
      prevRank[id] = idx + 1;
    });
  }

  return items.map(function (i) {
    const p = hasPrev ? prevRank[i.id] || null : null;
    return Object.assign({}, i, {
      prevRank: p,
      rankChange: p ? p - i.rank : null,
      isNew: hasPrev ? !p : false
    });
  });
}

async function attachRankChange(items, period, language) {
  if (language) {
    return items.map(function (i) {
      return Object.assign({}, i, { prevRank: null, rankChange: null, isNew: false });
    });
  }

  let prevIds = null;
  try {
    const r = await db
      .collection('rank_snapshots')
      .where({ period: period, d: _.lt(dayStr(0)) })
      .orderBy('d', 'desc')
      .limit(1)
      .get();
    if (r.data && r.data[0]) prevIds = r.data[0].ids || null;
  } catch (e) {
    console.warn('[rank] read failed', e.message);
  }

  return computeRankDiff(prevIds, items);
}

/* ------------------------------------------------------------------ */
/* 主逻辑                                                               */
/* ------------------------------------------------------------------ */

async function buildList(period, language, opts) {
  opts = opts || {};
  const mode = opts.source || 'auto'; // auto | official | search
  let items = [];
  let dataSource = '';

  // 通道 A：官方 HTML（严格官方顺序 + 页面上的真实 stars today）
  if (mode !== 'search') {
    try {
      const html = await fetchOfficial(period, language);
      items = parseOfficialTrending(html, period);

      if (items.length < 5) {
        console.warn('[official] 解析结果过少（' + items.length + '），可能是 React 空壳，转 Search API');
        items = [];
      } else {
        dataSource = 'official';
      }
    } catch (e) {
      console.warn('[official] 失败，转 Search API：' + e.message);
      items = [];
    }
  }

  // 通道 B：Search API
  if (!items.length) {
    if (mode === 'official') {
      throw new Error('官方 trending 页面取数失败，且当前只允许 official 模式');
    }
    items = await searchFallback(period, language);
    dataSource = 'search';
  } else if (process.env.OFFICIAL_TOPUP === '1' && items.length < 20) {
    // 默认「官方给多少就是多少」，保证与 github.com/trending 逐条一致。
    // 想让列表更长时，云函数环境变量设 OFFICIAL_TOPUP=1，会用 Search 把不足 25 条补齐
    // （补进来的排在尾部，各自 dataSource=search，前端底部会标「官方榜单 + 搜索补充」）。
    try {
      const extra = await searchFallback(period, language);
      const seenIds = {};
      items.forEach(function (i) {
        seenIds[i.id] = 1;
      });
      const add = extra.filter(function (i) {
        return !seenIds[i.id];
      });
      add.sort(function (a, b) {
        return (b.hot || 0) - (a.hot || 0);
      });
      if (add.length) {
        console.log('[official] 只有 ' + items.length + ' 条，用 Search 补 ' + add.length + ' 条');
        items = items.concat(add.slice(0, 25 - items.length));
        dataSource = 'official+search';
      }
    } catch (e) {
      console.warn('[official] 补齐失败，仍用官方结果：' + e.message);
    }
  }

  // 去重
  const seen = {};
  items = items.filter(function (i) {
    if (!i.id || seen[i.id]) return false;
    seen[i.id] = 1;
    return true;
  });

  items = await attachZh(items, opts);
  items = await attachTrend(items, period);

  // 纯 official 时保留官方顺序；含 search 条目时才按 hot 重排尾部
  if (dataSource === 'search') {
    items.sort(function (a, b) {
      if ((b.hot || 0) !== (a.hot || 0)) return (b.hot || 0) - (a.hot || 0);
      return (b.stars || 0) - (a.stars || 0);
    });
  }

  items = items.slice(0, 25).map(function (i, idx) {
    return Object.assign({}, i, { rank: idx + 1 });
  });

  items = await attachRankChange(items, period, language);

  // 顶层汇总 dataSource，供前端展示「数据源」
  return { items: items, dataSource: dataSource };
}

// 供本地测试直接调用（云函数运行时只调用 main）
exports.__parseOfficial = parseOfficialTrending;
exports.__normalizeSearch = normalizeSearch;
exports.__computeRankDiff = computeRankDiff;
exports.__LANGUAGES = LANGUAGES;
exports.__PERIOD_META = PERIOD_META;

exports.main = async function (event) {
  const action = event && event.action;
  const period = (event && event.period) || 'daily';
  const language = (event && event.language) || '';
  const opts = {
    skipZh: !!(event && event.skipZh),
    source: (event && event.source) || 'auto'
  };

  try {
    if (action === 'detail') {
      const id = event.id;
      if (!id) return { ok: false, message: '缺少 id' };

      try {
        const repoJson = await getRepo(id);
        if (repoJson) {
          let one = normalizeSearch({ items: [repoJson] }, period);
          one = await attachZh(one, opts);
          one = await attachTrend(one, period);
          const item = Object.assign({}, one[0], {
            rank: 0,
            prevRank: null,
            rankChange: null,
            isNew: false,
            dataSource: 'api'
          });
          return { ok: true, item: item };
        }
        return { ok: true, item: null };
      } catch (e) {
        console.warn('[detail] single repo failed, fallback to list', e.message);
      }

      const built = await buildList(period, language, opts);
      return {
        ok: true,
        item:
          built.items.filter(function (i) {
            return i.id === id;
          })[0] || null
      };
    }

    const built = await buildList(period, language, opts);

    return {
      ok: true,
      period: period,
      language: language,
      generatedAt: Date.now(),
      languages: LANGUAGES,
      dataSource: built.dataSource || (built.items.length ? built.items[0].dataSource : 'none'),
      items: built.items
    };
  } catch (e) {
    console.error('[getTrending] failed', e);
    return {
      ok: false,
      message: e.message || '抓取 GitHub 数据失败',
      period: period,
      language: language
    };
  }
};
