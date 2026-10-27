/* ==========================================================================
   GithubTrending · 网页版逻辑
   数据：window.TRENDING（由 scripts/snapshot.js 生成）
   无依赖、无构建；file:// 直接打开也能运行
   ========================================================================== */
(function () {
  'use strict';

  var DATA = window.TRENDING || null;

  var PERIODS = [
    { value: 'daily', label: '今日', unit: '今日新增' },
    { value: 'weekly', label: '本周', unit: '本周新增' },
    { value: 'monthly', label: '本月', unit: '本月新增' }
  ];

  var FAV_KEY = 'ght:favs';
  var THEME_KEY = 'ght:theme';

  var state = {
    period: 'daily',
    lang: '',
    q: '',
    onlyFavs: false,
    theme: 'dark',
    favs: {}
  };

  var $ = function (id) {
    return document.getElementById(id);
  };

  /* ---------------- 工具 ---------------- */

  function num(n) {
    if (n == null) return '0';
    return Number(n).toLocaleString('en-US');
  }

  function fmtNum(n) {
    n = Number(n) || 0;
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万';
    return num(n);
  }

  function timeAgo(ts) {
    if (!ts) return '';
    var d = Date.now() - ts;
    if (d < 60000) return '刚抓取';
    if (d < 3600000) return '抓取于 ' + Math.floor(d / 60000) + ' 分钟前';
    if (d < 86400000) return '抓取于 ' + Math.floor(d / 3600000) + ' 小时前';
    return '抓取于 ' + Math.floor(d / 86400000) + ' 天前';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---------------- 搜索匹配工具 ---------------- */

  /** 把搜索词切成关键词（空格分词，全部命中才算匹配） */
  function searchTokens() {
    return state.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  }

  function escRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** 每个关键词都出现在文本里 */
  function matchAll(text, toks) {
    var t = String(text == null ? '' : text).toLowerCase();
    for (var i = 0; i < toks.length; i++) {
      if (t.indexOf(toks[i]) === -1) return false;
    }
    return true;
  }

  /** 转义 + 把命中的关键词包成 <mark>，让用户看得出为什么这条被搜出来 */
  function hl(text, toks) {
    var s = String(text == null ? '' : text);
    if (!toks || !toks.length) return esc(s);

    var re = new RegExp('(' + toks.map(escRe).join('|') + ')', 'gi');
    var out = '';
    var last = 0;
    var m;
    while ((m = re.exec(s)) !== null) {
      if (m[0] === '') {
        re.lastIndex++;
        continue;
      }
      out += esc(s.slice(last, m.index)) + '<mark class="hl">' + esc(m[0]) + '</mark>';
      last = m.index + m[0].length;
    }
    return out + esc(s.slice(last));
  }

  /**
   * 命中位置靠后时，截一段窗口出来，前面加省略号。
   * 解决「搜到了但卡片上被截断看不见」的问题（例如 rea 命中 audiobook creation）。
   */
  function snippet(text, toks, max) {
    var s = String(text == null ? '' : text);
    if (!toks || !toks.length) return s;
    var lower = s.toLowerCase();
    var idx = -1;
    toks.forEach(function (k) {
      var i = lower.indexOf(k);
      if (i > -1 && (idx === -1 || i < idx)) idx = i;
    });
    if (idx === -1) return s;
    max = max || 88;
    if (idx < max * 0.45) return s.length > max ? s.slice(0, max) : s;

    var start = Math.max(0, idx - Math.floor(max * 0.35));
    // 从词边界开始，避免出现「…n, transcription」这种切断单词的片段
    if (start > 0) {
      var sp = s.indexOf(' ', start);
      if (sp > -1 && sp < idx) start = sp + 1;
    }
    var end = Math.min(s.length, start + max);
    var tail = end < s.length ? '…' : '';
    return (start > 0 ? '…' : '') + s.slice(start, end).trim() + tail;
  }

  /** 纯相对时间（用于「收藏于 X」），不带「抓取于」前缀 */
  function agoText(ts) {
    if (!ts) return '';
    var d = Date.now() - ts;
    if (d < 60000) return '刚刚';
    if (d < 3600000) return Math.floor(d / 60000) + ' 分钟前';
    if (d < 86400000) return Math.floor(d / 3600000) + ' 小时前';
    return Math.floor(d / 86400000) + ' 天前';
  }

  function hexToRgb(hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length !== 6) h = '8b949e';
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function rgba(hex, a) {
    var c = hexToRgb(hex);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }

  function gradient(color) {
    var c = hexToRgb(color);
    var d = function (k) {
      return 'rgb(' + Math.round(c[0] * k) + ',' + Math.round(c[1] * k) + ',' + Math.round(c[2] * k) + ')';
    };
    return 'linear-gradient(145deg,' + d(1) + ',' + d(0.62) + ' 62%, #1b2430)';
  }

  /* ---------------- 数据 ---------------- */

  function periodItems() {
    if (!DATA || !DATA.periods) return [];
    return DATA.periods[state.period] || [];
  }

  function languages() {
    var base = (DATA && DATA.languages) || [];
    var seen = {};
    return base.filter(function (l) {
      if (!l.value) return true;
      if (seen[l.value]) return false;
      seen[l.value] = 1;
      return true;
    });
  }

  /** 所有周期里出现过的条目，按 id 建索引（收藏查找用） */
  function allPeriodIndex() {
    var idx = {};
    PERIODS.forEach(function (p) {
      (DATA.periods[p.value] || []).forEach(function (it) {
        if (!idx[it.id]) {
          var copy = {};
          for (var k in it) copy[k] = it[k];
          copy.fromPeriod = p.value; // 记住它来自哪个周期，避免跨周期收藏显示错的名次文案
          idx[it.id] = copy;
        }
      });
    });
    return idx;
  }

  /** 把周期值翻成中文，用于「本周榜 #N」这类文案 */
  function periodLabel(value) {
    for (var i = 0; i < PERIODS.length; i++) {
      if (PERIODS[i].value === value) return PERIODS[i].label || PERIODS[i].unit.replace('新增', '');
    }
    return '';
  }

  /**
   * 收藏列表
   * 关键：不能从「当前周期的榜单」里过滤——收藏的项目掉榜后就不在榜单里了，
   * 那样会凭空消失（这就是之前只显示一个的 bug）。
   * 这里直接读收藏库：榜单里还有就用最新数据，掉榜了就用收藏时的快照。
   */
  function favItems() {
    var idx = allPeriodIndex();
    var list = [];

    Object.keys(state.favs).forEach(function (id) {
      var saved = state.favs[id];
      var cur = idx[id];

      if (cur) {
        var merged = {};
        for (var k in cur) merged[k] = cur[k];
        merged.savedAt = saved && saved.ts;
        list.push(merged);
        return;
      }

      // 掉出所有榜单：用收藏时的快照兜底
      var snap = saved && saved.id ? normalizeFav(saved) : null;
      if (!snap) {
        // 兼容早期只存 true 的旧数据
        var parts = String(id).split('/');
        snap = { id: id, owner: parts[0], repo: parts[1] || id, fullName: id, purpose: '', descEn: '' };
      }
      var copy = {};
      for (var k2 in snap) copy[k2] = snap[k2];
      copy.offList = true;
      copy.rank = null;
      copy.rankChange = null;
      copy.isNew = false;
      list.push(copy);
    });

    return list.sort(function (a, b) {
      return (b.savedAt || 0) - (a.savedAt || 0);
    });
  }

  function visibleItems() {
    var items = state.onlyFavs ? favItems() : periodItems();
    if (state.lang) {
      var display = state.lang;
      languages().forEach(function (l) {
        if (l.value === state.lang) display = l.name;
      });
      items = items.filter(function (i) {
        return i.language === display;
      });
    }
    var q = searchTokens();
    if (q.length) {
      items = items.filter(function (i) {
        var hay = [
          i.fullName,
          i.purpose,
          i.descEn,
          i.language,
          (i.tags || []).join(' ')
        ].join(' ');
        return matchAll(hay, q);
      });
    }
    return items;
  }

  function unitLabel() {
    for (var i = 0; i < PERIODS.length; i++) {
      if (PERIODS[i].value === state.period) return PERIODS[i].unit;
    }
    return '新增';
  }

  /* ---------------- 收藏 ---------------- */

  /**
   * 收藏时保存的完整快照。
   * 早期版本只存了 9 个字段，导致掉榜后的收藏出现：头像丢失、作者名为空、
   * 「打开 GitHub」点不动（url 没存）。这里把所有渲染要用的字段都存上。
   */
  function favSnapshot(item) {
    return {
      id: item.id,
      owner: item.owner || String(item.id).split('/')[0] || '',
      repo: item.repo || String(item.id).split('/')[1] || item.id,
      fullName: item.fullName || item.id,
      url: item.url || 'https://github.com/' + item.id,
      purpose: item.purpose || '',
      detail: item.detail || '',
      descEn: item.descEn || '',
      language: item.language || '',
      languageColor: item.languageColor || '#8b949e',
      stars: item.stars,
      forks: item.forks,
      hot: item.hot,
      trend: item.trend,
      tags: item.tags || [],
      zhSource: item.zhSource || 'none',
      hasZh: !!item.hasZh,
      rank: item.rank,
      fromPeriod: item.fromPeriod || state.period,
      ts: Date.now()
    };
  }

  /**
   * 修复历史收藏记录：老数据缺 owner/repo/url，从 id 里推出来。
   * 这样用户不用清缓存，旧收藏自动恢复正常显示与正常链接。
   */
  function normalizeFav(f) {
    if (!f || !f.id) return null;
    var parts = String(f.id).split('/');
    if (!f.owner) f.owner = parts[0] || '';
    if (!f.repo) f.repo = parts[1] || f.id;
    if (!f.fullName) f.fullName = f.id;
    if (!f.url || !/^https?:\/\//.test(f.url)) f.url = 'https://github.com/' + f.id;
    return f;
  }

  function loadFavs() {
    try {
      var raw = localStorage.getItem(FAV_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      state.favs = {};
      Object.keys(parsed).forEach(function (id) {
        var v = parsed[id];
        // 兼容早期只存 true 的记录
        var rec = v === true ? { id: id, ts: 0 } : v;
        var fixed = normalizeFav(rec);
        if (fixed) state.favs[id] = fixed;
      });
    } catch (e) {
      state.favs = {};
    }
  }

  function saveFavs() {
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(state.favs));
    } catch (e) {
      /* 隐私模式下会失败，忽略 */
    }
  }

  function toggleFav(item) {
    if (state.favs[item.id]) delete state.favs[item.id];
    else state.favs[item.id] = favSnapshot(item);
    saveFavs();
    renderFavCount();
  }

  function renderFavCount() {
    var n = Object.keys(state.favs).length;
    var badge = $('favCount');
    badge.textContent = n ? String(n) : '';
    $('btnFav').classList.toggle('on', state.onlyFavs);
  }

  /* ---------------- 主题 ---------------- */

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    try {
      localStorage.setItem(THEME_KEY, state.theme);
    } catch (e) {}
  }

  /* ---------------- 渲染：分段 / 筛选 ---------------- */

  function renderSeg() {
    var seg = $('seg');
    seg.innerHTML = PERIODS.map(function (p) {
      return (
        '<button role="tab" data-period="' + p.value + '"' +
        (p.value === state.period ? ' class="on"' : '') +
        '>' + p.label + '</button>'
      );
    }).join('');
  }

  function renderChips() {
    var chips = $('chips');
    var items = periodItems();

    // 只显示「当前周期里真的存在」的语言。
    // 以前 chips 是全周期并集，切到本周/本月后点某个语言会得到 0 条（空态），看着像坏了。
    var present = {};
    items.forEach(function (i) {
      if (i.language && i.language !== 'Unknown') present[i.language] = 1;
    });

    // 当前选中的语言在本周期不存在 → 自动回到「全部」
    if (state.lang) {
      var current = '';
      languages().forEach(function (l) {
        if (l.value === state.lang) current = l.name;
      });
      if (!present[current]) {
        state.lang = '';
      }
    }

    var langs = languages().filter(function (l) {
      return !l.value || present[l.name];
    });

    chips.innerHTML = langs
      .map(function (l) {
        var on = (l.value || '') === state.lang;
        return (
          '<button class="chip' + (on ? ' on' : '') + '" data-lang="' + esc(l.value || '') + '">' +
          (l.color ? '<i class="swatch" style="background:' + esc(l.color) + '"></i>' : '') +
          esc(l.name) +
          '</button>'
        );
      })
      .join('');
  }

  /* ---------------- 渲染：卡片 ---------------- */

  /**
   * 卡片右下角的迷你柱：近 12 个数据点的 star 走势
   * 最后 4 根用强调色（= 最近 4 个数据点）
   *
   * 但是：只有 1 天真实数据时，其余点都是按同一个公式回推的估算，
   * 归一化后每张卡形状完全一样（4,5,6,7,...,20），等于零信息还装得像数据。
   * 所以真实点数 < 2 时干脆不画，等积累了真实数据再出现。
   */
  function sparkHtml(item) {
    var trend = item.trend || [];
    if (!trend.length) return '';

    var realPts = item.trendRealPoints || 0;
    if (realPts < 3) return '';
    // 只画真实数据点：估算的点画出来会变成「看起来像数据」的假趋势
    var bars = trend.slice(-Math.min(12, realPts));
    var min = Math.min.apply(null, bars);
    var max = Math.max.apply(null, bars);
    var span = max - min || 1;
    return bars
      .map(function (v, i) {
        // 4~20px：差值更明显，缩小尺寸也能看出趋势
        var h = 4 + Math.round(((v - min) / span) * 16);
        var on = i >= bars.length - 4;
        return '<i class="' + (on ? 'on' : '') + '" style="height:' + h + 'px"></i>';
      })
      .join('');
  }

  function rankBadge(item) {
    if (item.offList) return '<span class="rk rk-off">已下榜</span>';
    if (item.rankChange == null) {
      if (item.isNew) return '<span class="rk rk-new">NEW</span>';
      return '';
    }
    if (item.rankChange > 0) return '<span class="rk rk-up">↑' + item.rankChange + '</span>';
    if (item.rankChange < 0) return '<span class="rk rk-down">↓' + Math.abs(item.rankChange) + '</span>';
    return '';
  }

  /**
   * 卡片缩略图：作者头像 + 首字母兜底
   * - 头像走 https://github.com/{owner}.png?size=96（302 到 GitHub 头像 CDN）
   *   仓库和 Actions 都不增加任何体积/开销，只有访客浏览器去取（约 3~5 KB，会被缓存）
   * - 加载失败（离线、被墙、403）就自动移除，露出底下的渐变字母块
   */
  function thumbHtml(item, initial) {
    var owner = String(item.owner || '').trim();
    var img = '';
    if (owner && owner !== 'ghost' && /^[A-Za-z0-9._-]+$/.test(owner)) {
      img =
        '<img class="av" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"' +
        ' style="opacity:0" onload="this.style.opacity=1"' +
        ' src="https://github.com/' + esc(owner) + '.png?size=96"' +
        ' onerror="this.remove()">';
    }
    return (
      '<div class="thumb" style="background:' + gradient(item.languageColor) + '">' +
      '<span class="ini">' + esc(initial) + '</span>' +
      img +
      '</div>'
    );
  }

  function cardHtml(item, idx, renumber) {
    var rankClass = idx === 0 ? ' top1' : idx === 1 ? ' top2' : idx === 2 ? ' top3' : '';
    var initial = (item.repo || item.fullName || '?').charAt(0).toUpperCase();
    var showEn = item.descEn && String(item.descEn).trim() !== String(item.purpose || '').trim();
    // GitHub 有些仓库没识别出主语言（API 里 language 为 null），别直接显示英文 Unknown
    var langText = !item.language || item.language === 'Unknown' ? '未标注' : item.language;

    var toks = searchTokens();
    var searching = toks.length > 0;

    // 英文描述：命中点在后面时截一段窗口，保证高亮的部分真的能看见
    var enText = item.descEn;
    if (searching && enText) enText = snippet(enText, toks, 88);

    // 命中的标签单独显示（标签平时不在卡片上，不显示的话用户不知道为啥匹配）
    var hitTags = searching
      ? (item.tags || []).filter(function (t) {
          return matchAll(t, toks);
        })
      : [];

    return (
      '<article class="card" data-id="' + esc(item.id) + '" tabindex="0">' +
      '<div class="rank' + rankClass + '">' + (state.onlyFavs ? '★' : renumber ? idx + 1 : item.rank) + '</div>' +
      thumbHtml(item, initial) +
      '<div class="body">' +
      '<div class="name">' + (item.owner ? '<span class="owner">' + hl(item.owner, toks) + '/</span>' : '') + '<b>' + hl(item.repo || item.id, toks) + '</b>' +
      rankBadge(item) +
      '</div>' +
      '<p class="purpose">' + hl(item.purpose, toks) + '</p>' +
      (showEn ? '<p class="en"><span class="en-tag">EN</span>' + hl(enText, toks) + '</p>' : '') +
      '<div class="meta">' +
      '<span class="lang"><i style="background:' + esc(item.languageColor) + '"></i>' + hl(langText, toks) + '</span>' +
      hitTags
        .map(function (t) {
          return '<span class="tag">' + hl(t, toks) + '</span>';
        })
        .join('') +
      '<span class="stars">★ ' + fmtNum(item.stars) + '</span>' +
      '<span class="hot">▲ ' + fmtNum(item.hot) + '</span>' +
      (function () {
        var spark = sparkHtml(item);
        return spark ? '<span class="spark" title="近 12 个数据点的 star 走势，最后 4 根为最近 4 个点">' + spark + '</span>' : '';
      })() +
      '</div>' +
      '</div>' +
      '</article>'
    );
  }

  function renderList() {
    var items = visibleItems();
    var list = $('list');
    var searching = !!state.q.trim();
    // 筛选后序号要重排：语言筛选或搜索时，序号代表「当前列表内第几个」
    var renumber = !!state.lang || searching;

    var head = searching
      ? '搜索「' + state.q.trim() + '」'
      : state.onlyFavs
      ? '按收藏时间排序'
      : '按' + unitLabel() + '排序';

    if (renumber && !state.onlyFavs) {
      var langName = state.lang;
      languages().forEach(function (l) {
        if (l.value === state.lang) langName = l.name;
      });
      if (!searching && state.lang) head += '（' + langName + ' 内序号）';
      else if (searching) head += '（结果内序号）';
    }

    $('sortLabel').textContent = head;
    $('total').textContent = items.length + (state.onlyFavs ? ' 个收藏' : ' 个上榜');

    if (!items.length) {
      var icon = searching ? '⌕' : state.onlyFavs ? '★' : '🔍';
      var title = searching
        ? '没有匹配「' + esc(state.q.trim()) + '」的项目'
        : state.onlyFavs
        ? '还没有收藏'
        : '这个筛选下暂时没有项目';
      var desc = searching
        ? '试试仓库名（如 claude）、用途关键词（如 记忆）或语言'
        : state.onlyFavs
        ? '点开任意项目，在详情里点「收藏」'
        : '换一个语言或周期看看';
      list.innerHTML =
        '<div class="state" style="grid-column:1/-1"><div class="big">' + icon +
        '</div><h3>' + title + '</h3><p>' + desc + '</p></div>';
      return;
    }

    list.innerHTML = items
      .map(function (it, i) {
        return cardHtml(it, i, renumber);
      })
      .join('');
  }

  function renderMeta() {
    if (!DATA) {
      $('updated').textContent = '数据缺失';
      $('count').textContent = '';
      $('source').textContent = '无数据';
      $('foot-warn').hidden = false;
      $('foot-warn').textContent = '没有找到 data/trending.js，请先执行 node scripts/snapshot.js 生成数据。';
      return;
    }
    var total = periodItems().length;
    var zhCount = periodItems().filter(function (i) {
      return i.hasZh;
    }).length;
    $('updated').textContent = timeAgo(DATA.generatedAt);
    $('count').textContent =
      '共 ' + total + ' 个' + (zhCount < total ? ' · 中文 ' + zhCount + '/' + total : '');
    $('source').textContent = '官方榜单快照';
    var warn = $('foot-warn');
    warn.hidden = false;

    var when = new Date(DATA.generatedAt).toLocaleString('zh-CN');
    var history;
    if (DATA.hasPrevDay) {
      history =
        '已积累 ' + DATA.historyDays + ' 天数据，升降标记对比的是 ' + DATA.prevDate +
        ' 的榜单；star 曲线中 ' + Math.min(DATA.historyDays, 30) + ' 天为真实记录。';
    } else {
      history = '这是首日快照，升降标记（↑N / ↓N / NEW）从明天起才会出现；star 曲线目前按日均增量回推。';
    }
    // 数据太旧就明确警告：定时任务可能被 GitHub 跳过（实测发生过），
    // 不提示的话用户只会觉得「网站坏了」
    var ageHours = (Date.now() - Number(DATA.generatedAt)) / 3600000;
    var stale =
      ageHours > 30
        ? '⚠️ 数据已 ' + Math.floor(ageHours) + ' 小时未更新，定时任务可能被跳过——可到仓库 Actions 页点 Run workflow 手动更新。'
        : '';
    warn.textContent =
      (stale ? stale + ' ' : '') +
      '内容与 github.com/trending 逐条一致（抓取于 ' + when + '）。' +
      '每天自动抓取两次（约 08:17 / 12:17），刷新页面不会重新抓取。' +
      history;

    var zhLine = $('foot-zh');
    if (zhLine) {
      var aiPart = DATA.zhAi > 0 ? ' + DeepSeek 自动补齐（本次新增 ' + DATA.zhAi + ' 条）' : '（缺的条目会自动调用 DeepSeek 补齐）';
      zhLine.textContent =
        '中文用途：人工对照表' + aiPart + '；AI 生成的条目会在详情页标注来源';
    }
  }

  /* ---------------- 详情 ---------------- */

  var currentId = null;

  function findItem(id) {
    if (!DATA || !DATA.periods) return null;
    var keys = Object.keys(DATA.periods);
    for (var i = 0; i < keys.length; i++) {
      var arr = DATA.periods[keys[i]] || [];
      for (var j = 0; j < arr.length; j++) {
        if (arr[j].id === id) return arr[j];
      }
    }
    // 榜单里都没有：可能是收藏过、后来掉榜的项目，用收藏快照兜底
    var saved = normalizeFav(state.favs[id]);
    if (saved && saved.id) {
      var copy = {};
      for (var k in saved) copy[k] = saved[k];
      copy.offList = true;
      copy.rank = null;
      return copy;
    }
    return null;
  }

  function detailHtml(item) {
    var initial = (item.repo || '?').charAt(0).toUpperCase();
    var faved = !!state.favs[item.id];
    var trend = item.trend || [];
    var nPts = trend.length; // trend 里现在只有真实记录，nPts 就是真实天数
    var delta = nPts >= 2 ? trend[nPts - 1] - trend[0] : 0;
    var chartDeltaText = nPts >= 2 ? (delta >= 0 ? '+' : '') + num(delta) + ' ★' : '—';
    var chartNote =
      nPts >= 2
        ? '全部为真实记录 · 已积累 ' + nPts + ' 天' + (nPts < 30 ? '（每天 1 次抓取，第 30 天起为完整视图）' : '')
        : '还没有可比的数据点';
    var tags = (item.tags || []).map(function (t) {
      return '<span class="tag">' + esc(t) + '</span>';
    }).join('');

    // 该语言在这个周期里的名次（和列表筛选后的序号一致，避免详情与列表对不上）
    var langName = !item.language || item.language === 'Unknown' ? '' : item.language;
    var langRank = null;
    if (!item.offList && langName) {
      var p = item.fromPeriod || state.period;
      var same = (DATA.periods[p] || []).filter(function (x) {
        return x.language === langName;
      });
      for (var si = 0; si < same.length; si++) {
        if (same[si].id === item.id) {
          langRank = si + 1;
          break;
        }
      }
    }

    var badgeTail;
    if (item.offList) {
      badgeTail = '📌 已下榜' + (item.ts ? ' · 收藏于 ' + agoText(item.ts) : '');
    } else {
      badgeTail =
        '⚡ ' + esc(periodLabel(item.fromPeriod || state.period)) + '榜 #' + item.rank +
        ' · ' +
        (langName ? esc(langName) : '未标注语言') +
        (langRank ? ' 第 ' + langRank : '');
    }

    return (
      '<div class="dbadge">' + badgeTail + '</div>' +
      '<h2 class="dname">' + (item.owner ? '<span class="owner">' + esc(item.owner) + '/</span>' : '') + esc(item.repo || item.id) + '</h2>' +
      '<p class="dpurpose">' + esc(item.purpose) + '</p>' +
      (item.rankChange != null
        ? '<div class="dnote">· 比上次榜单 ' +
          (item.rankChange > 0 ? '↑ ' + item.rankChange + ' 位' : item.rankChange < 0 ? '↓ ' + Math.abs(item.rankChange) + ' 位' : '持平') +
          '</div>'
        : item.isNew
        ? '<div class="dnote">· 新上榜</div>'
        : '') +
      '<div class="stats">' +
      '<div class="stat"><div class="k">STARS</div><div class="v">' + num(item.stars) + '</div></div>' +
      '<div class="stat"><div class="k">' + esc(unitLabel()) + '</div><div class="v green">+' + num(item.hot) + '</div></div>' +
      '<div class="stat"><div class="k">FORKS</div><div class="v">' + fmtNum(item.forks) + '</div></div>' +
      '</div>' +
      '<div class="panel">' +
      '<h4>近 ' + nPts + ' 天 Star 走势<span>' + chartDeltaText + '</span></h4>' +
      (nPts >= 2
        ? '<div class="chart-note">' + chartNote + '</div>' +
          '<div class="chart-wrap"><canvas id="chart"></canvas>' +
          '<div class="chart-tip" id="chartTip" hidden></div></div>' +
          '<div class="axis" id="axis"></div>'
        : '<div class="chart-empty">📈 数据积累中：已有 ' + nPts + ' 天真实记录。' +
          '每天抓取一次，满 3 天起显示走势图——不足 3 天的「曲线」只能靠猜，所以先不画。</div>') +
      '</div>' +
      '<div class="panel">' +
      '<h4>这个项目是做什么的<span>' +
      (item.zhSource === 'auto' ? 'AI 生成' : item.hasZh || item.purpose ? '中文说明' : '暂无中文，下面是原文') +
      '</span></h4>' +
      '<p class="dtext">' + esc(item.detail || item.purpose || '') + '</p>' +
      (tags ? '<div class="tags">' + tags + '</div>' : '') +
      '</div>' +
      (item.descEn
        ? '<div class="panel"><h4>ORIGINAL DESCRIPTION<span>原文</span></h4><div class="quote">' +
          esc(item.descEn) + '</div></div>'
        : '') +
      '<div class="actions">' +
      '<a class="btn btn-primary" href="' + esc(item.url || 'https://github.com/' + item.id) + '" target="_blank" rel="noopener">↗ 打开 GitHub</a>' +
      '<button class="btn btn-ghost' + (faved ? ' on' : '') + '" id="btnFavItem">' +
      (faved ? '★ 已收藏' : '☆ 收藏') +
      '</button>' +
      '</div>' +
      '<div style="height:20px"></div>'
    );
  }

  /**
   * 走势图悬浮交互：鼠标移到任意位置，显示该数据点的日期 / 星数 / 相对前一天的变化
   * 只读真实数据，所以这里显示的每个数字都是实测值
   */
  function bindChartHover(canvas) {
    var tip = $('chartTip');
    if (!tip) return;

    function show(e) {
      var g = canvas.__geo;
      if (!g || g.n < 2) return;
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var idx = Math.round(((mx - g.padL) / g.iw) * (g.n - 1));
      idx = Math.max(0, Math.min(g.n - 1, idx));

      var v = g.trend[idx];
      var prev = idx > 0 ? g.trend[idx - 1] : null;
      var diff = prev == null ? null : v - prev;
      // 第 idx 个点对应「今天往前数 (n-1-idx) 天」
      var d = new Date(Date.now() - (g.n - 1 - idx) * 86400000);
      var ds = d.getMonth() + 1 + '/' + d.getDate();

      tip.innerHTML =
        '<b>' + num(v) + '</b> ★' +
        '<span>' + ds + (diff == null ? ' · 起点' : ' · ' + (diff >= 0 ? '+' : '') + num(diff)) + '</span>';
      tip.hidden = false;

      // 定位到数据点正上方，靠边时贴边
      var px = g.padL + (g.iw * idx) / (g.n - 1);
      var tw = tip.offsetWidth || 90;
      var left = Math.max(0, Math.min(rect.width - tw, px - tw / 2));
      tip.style.left = left + 'px';
      tip.style.top = '2px';

      drawChart(canvas, g.trend, g.realStart, idx);
    }

    canvas.addEventListener('mousemove', show);
    canvas.addEventListener('mouseleave', function () {
      tip.hidden = true;
      var g = canvas.__geo;
      if (g) drawChart(canvas, g.trend, g.realStart, -1);
    });
    // 触屏：点一下也能看
    canvas.addEventListener('touchstart', function (e) {
      if (e.touches && e.touches[0]) show(e.touches[0]);
    }, { passive: true });
  }

  function drawChart(canvas, trend, realStart, activeIdx) {
    if (!canvas || !trend || trend.length < 2) return;
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth;
    var h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    var min = Math.min.apply(null, trend);
    var max = Math.max.apply(null, trend);
    var pad = (max - min) * 0.18 || max * 0.05 || 1;
    min -= pad;
    max += pad;

    var padL = 0;
    var padR = 8;
    var padT = 10;
    var padB = 22;
    var iw = w - padL - padR;
    var ih = h - padT - padB;

    var x = function (i) {
      return padL + (iw * i) / (trend.length - 1);
    };
    var y = function (v) {
      return padT + ih - ((v - min) / (max - min || 1)) * ih;
    };

    ctx.clearRect(0, 0, w, h);
    var realStartIdx = realStart > 0 && realStart < trend.length ? trend.length - realStart : -1;
    // 供悬浮提示反查坐标
    canvas.__geo = { padL: padL, padT: padT, iw: iw, ih: ih, n: trend.length, trend: trend, realStart: realStart };

    // 网格
    ctx.strokeStyle = 'rgba(139,148,158,0.14)';
    ctx.lineWidth = 1;
    for (var g = 0; g <= 3; g++) {
      var gy = padT + (ih * g) / 3;
      ctx.beginPath();
      ctx.moveTo(padL, gy);
      ctx.lineTo(w - padR, gy);
      ctx.stroke();
    }

    // 面积
    var grad = ctx.createLinearGradient(0, padT, 0, padT + ih);
    grad.addColorStop(0, 'rgba(79,156,249,0.34)');
    grad.addColorStop(1, 'rgba(79,156,249,0)');
    ctx.beginPath();
    ctx.moveTo(x(0), y(trend[0]));
    for (var i = 1; i < trend.length; i++) ctx.lineTo(x(i), y(trend[i]));
    ctx.lineTo(x(trend.length - 1), padT + ih);
    ctx.lineTo(x(0), padT + ih);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // 折线
    ctx.beginPath();
    ctx.moveTo(x(0), y(trend[0]));
    for (var k = 1; k < trend.length; k++) ctx.lineTo(x(k), y(trend[k]));
    ctx.strokeStyle = '#4f9cf9';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // 悬浮高亮：在当前鼠标位置画一条竖线 + 一个空心圆点
    if (typeof activeIdx === 'number' && activeIdx >= 0 && activeIdx < trend.length) {
      var ax = x(activeIdx);
      var ay = y(trend[activeIdx]);
      ctx.save();
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = 'rgba(79,156,249,.75)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax, padT);
      ctx.lineTo(ax, padT + ih);
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(ax, ay, 5, 0, Math.PI * 2);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ax, ay, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#4f9cf9';
      ctx.fill();
    }

    // 末点：先挖一个背景色圆，再画实心点，形成描边效果
    var lx = x(trend.length - 1);
    var ly = y(trend[trend.length - 1]);
    var bg = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#131820';
    ctx.beginPath();
    ctx.arc(lx, ly, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lx, ly, 3.4, 0, Math.PI * 2);
    ctx.fillStyle = '#4f9cf9';
    ctx.fill();

    // 真实数据起点：虚线 + 小标签，让「哪段是实测、哪段是推算」一眼可见
    if (realStartIdx > 0) {
      var rx = x(realStartIdx);
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(139,148,158,.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rx, padT);
      ctx.lineTo(rx, padT + ih);
      ctx.stroke();
      ctx.restore();

      // 起点小圆点
      ctx.beginPath();
      ctx.arc(rx, y(trend[realStartIdx]), 2.6, 0, Math.PI * 2);
      ctx.fillStyle = '#8b949e';
      ctx.fill();

      ctx.fillStyle = 'rgba(139,148,158,.9)';
      ctx.font = '10px system-ui, -apple-system, sans-serif';
      ctx.textAlign = rx > w - 44 ? 'right' : 'left';
      ctx.fillText('真实起点', rx > w - 44 ? rx - 4 : rx + 4, padT + 9);
    }
  }

  function renderAxis(trend) {
    var el = $('axis');
    if (!el) return;
    var n = trend.length;
    if (n < 2) {
      el.innerHTML = '';
      return;
    }
    var now = Date.now();
    var dateAt = function (idx) {
      var d = new Date(now - (n - 1 - idx) * 86400000);
      return d.getMonth() + 1 + '/' + d.getDate();
    };

    // 数据点少时逐个标日期（5 个标签摊到 2 个点上会重复成一串 10/18 10/18 10/19）
    var idxs;
    if (n <= 6) {
      idxs = [];
      for (var k = 0; k < n; k++) idxs.push(k);
    } else {
      idxs = [0, 1, 2, 3, 4].map(function (i) {
        return Math.round(((n - 1) * i) / 4);
      });
      // 去掉重复索引
      idxs = idxs.filter(function (v, i) {
        return idxs.indexOf(v) === i;
      });
    }

    // 用 flex 均分：索引位置与画布上的点对齐（画布两端各留 0 / 8px，肉眼可对齐）
    el.innerHTML = idxs
      .map(function (idx, i) {
        var first = i === 0;
        var last = i === idxs.length - 1;
        var style = first ? 'flex:0 0 auto' : last ? 'flex:0 0 auto;margin-left:auto' : 'flex:1 1 0;text-align:center';
        return '<span style="' + style + '">' + dateAt(idx) + '</span>';
      })
      .join('');
  }

  function openDetail(id) {
    var item = findItem(id);
    if (!item) return;
    currentId = id;
    // 深链：把当前项目写进 URL，方便分享 / 刷新后还原
    try {
      var u = new URL(location.href);
      u.searchParams.set('open', id);
      history.replaceState(null, '', u);
    } catch (e) {}
    currentId = id;
    $('drawerBody').innerHTML = detailHtml(item);
    $('drawer').classList.add('on');
    $('drawer').setAttribute('aria-hidden', 'false');
    $('scrim').classList.add('on');
    document.body.style.overflow = 'hidden';

    var canvas = $('chart');
    if (canvas) {
      // 等布局完成再画，避免 clientWidth 为 0
      requestAnimationFrame(function () {
        drawChart(canvas, item.trend || [], item.trendRealPoints || 0);
        renderAxis(item.trend || []);
        bindChartHover(canvas);
      });
    }

    var favBtn = $('btnFavItem');
    if (favBtn) {
      favBtn.addEventListener('click', function () {
        toggleFav(item);
        var nowFaved = !!state.favs[item.id];
        favBtn.className = 'btn btn-ghost' + (nowFaved ? ' on' : '');
        favBtn.textContent = nowFaved ? '★ 已收藏' : '☆ 收藏';
        renderList();
      });
    }
  }

  function closeDetail() {
    $('drawer').classList.remove('on');
    $('drawer').setAttribute('aria-hidden', 'true');
    $('scrim').classList.remove('on');
    document.body.style.overflow = '';
    currentId = null;
    try {
      var u = new URL(location.href);
      u.searchParams.delete('open');
      history.replaceState(null, '', u);
    } catch (e) {}
  }

  /* ---------------- 事件 ---------------- */

  function bind() {
    $('seg').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-period]');
      if (!btn) return;
      state.period = btn.getAttribute('data-period');
      state.onlyFavs = false;
      renderSeg();
      renderChips(); // 语言清单跟着周期变：本周榜里没有的语言不该出现
      renderList();
      renderFavCount();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    $('chips').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-lang]');
      if (!btn) return;
      state.lang = btn.getAttribute('data-lang');
      renderChips();
      renderList();
    });

    // 搜索：输入即过滤（数据只有几十条，不需要防抖）
    var q = $('q');
    q.addEventListener('input', function () {
      state.q = q.value || '';
      $('qClear').hidden = !state.q;
      renderList();
    });
    q.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        q.value = '';
        state.q = '';
        $('qClear').hidden = true;
        renderList();
      }
      if (e.key === 'Enter') {
        var first = document.querySelector('.card');
        if (first) openDetail(first.getAttribute('data-id'));
      }
    });
    $('qClear').addEventListener('click', function () {
      q.value = '';
      state.q = '';
      this.hidden = true;
      renderList();
      q.focus();
    });

    $('list').addEventListener('click', function (e) {
      var card = e.target.closest('.card');
      if (card) openDetail(card.getAttribute('data-id'));
    });

    $('list').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var card = e.target.closest('.card');
      if (card) {
        e.preventDefault();
        openDetail(card.getAttribute('data-id'));
      }
    });

    $('btnFav').addEventListener('click', function () {
      state.onlyFavs = !state.onlyFavs;
      renderFavCount();
      renderList();
    });

    $('btnTheme').addEventListener('click', function () {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      applyTheme();
      if (currentId) {
        var canvas = $('chart');
        var item = findItem(currentId);
        if (canvas && item) drawChart(canvas, item.trend || [], item.trendRealPoints || 0);
      }
    });

    $('btnClose').addEventListener('click', closeDetail);
    $('scrim').addEventListener('click', closeDetail);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDetail();
    });

    window.addEventListener('resize', function () {
      if (!currentId) return;
      var canvas = $('chart');
      var item = findItem(currentId);
      if (canvas && item) drawChart(canvas, item.trend || [], item.trendRealPoints || 0);
    });
  }

  /* ---------------- 启动 ---------------- */

  function init() {
    try {
      // 优先级：URL 参数（方便测试/分享指定主题）> 本地记忆 > 默认深色（品牌主视觉）
      var forced = new URLSearchParams(location.search).get('theme');
      if (forced === 'light' || forced === 'dark') state.theme = forced;
      else {
        var t = localStorage.getItem(THEME_KEY);
        if (t === 'light' || t === 'dark') state.theme = t;
        else state.theme = 'dark';
      }
    } catch (e) {}
    applyTheme();

    loadFavs();
    renderMeta();
    renderSeg();
    renderChips();
    renderList();
    renderFavCount();
    bind();

    // 支持 ?open=owner/repo 直接打开某个项目（可分享的深链）
    try {
      var open = new URLSearchParams(location.search).get('open');
      if (open) openDetail(open);
    } catch (e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();



















