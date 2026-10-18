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
    if (d < 60000) return '刚刚更新';
    if (d < 3600000) return Math.floor(d / 60000) + ' 分钟前更新';
    if (d < 86400000) return Math.floor(d / 3600000) + ' 小时前更新';
    return Math.floor(d / 86400000) + ' 天前更新';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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
      var snap = saved && saved.id ? saved : null;
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
    var q = state.q.trim().toLowerCase();
    if (q) {
      items = items.filter(function (i) {
        var hay = [
          i.fullName,
          i.purpose,
          i.descEn,
          i.language,
          (i.tags || []).join(' ')
        ]
          .join(' ')
          .toLowerCase();
        return hay.indexOf(q) > -1;
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

  function loadFavs() {
    try {
      var raw = localStorage.getItem(FAV_KEY);
      state.favs = raw ? JSON.parse(raw) : {};
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
    else
      state.favs[item.id] = {
        id: item.id,
        fullName: item.fullName,
        purpose: item.purpose,
        descEn: item.descEn,
        language: item.language,
        languageColor: item.languageColor,
        stars: item.stars,
        hot: item.hot,
        trend: item.trend,
        ts: Date.now()
      };
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
    var langs = languages();
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

  function sparkHtml(trend) {
    var bars = (trend || []).slice(-12);
    if (!bars.length) return '';
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

  function cardHtml(item, idx) {
    var rankClass = idx === 0 ? ' top1' : idx === 1 ? ' top2' : idx === 2 ? ' top3' : '';
    var initial = (item.repo || item.fullName || '?').charAt(0).toUpperCase();
    var showEn = item.descEn && String(item.descEn).trim() !== String(item.purpose || '').trim();
    // GitHub 有些仓库没识别出主语言（API 里 language 为 null），别直接显示英文 Unknown
    var langText = !item.language || item.language === 'Unknown' ? '未标注' : item.language;
    return (
      '<article class="card" data-id="' + esc(item.id) + '" tabindex="0">' +
      '<div class="rank' + rankClass + '">' + (state.onlyFavs ? '★' : item.rank) + '</div>' +
      '<div class="thumb" style="background:' + gradient(item.languageColor) + '">' + esc(initial) + '</div>' +
      '<div class="body">' +
      '<div class="name"><span class="owner">' + esc(item.owner) + '/</span><b>' + esc(item.repo) + '</b>' +
      rankBadge(item) +
      '</div>' +
      '<p class="purpose">' + esc(item.purpose) + '</p>' +
      (showEn ? '<p class="en"><span class="en-tag">EN</span>' + esc(item.descEn) + '</p>' : '') +
      '<div class="meta">' +
      '<span class="lang"><i style="background:' + esc(item.languageColor) + '"></i>' + esc(langText) + '</span>' +
      '<span class="stars">★ ' + fmtNum(item.stars) + '</span>' +
      '<span class="hot">▲ ' + fmtNum(item.hot) + '</span>' +
      '<span class="spark">' + sparkHtml(item.trend) + '</span>' +
      '</div>' +
      '</div>' +
      '</article>'
    );
  }

  function renderList() {
    var items = visibleItems();
    var list = $('list');
    var searching = !!state.q.trim();

    $('sortLabel').textContent = searching
      ? '搜索「' + state.q.trim() + '」'
      : state.onlyFavs
      ? '按收藏时间排序'
      : '按' + unitLabel() + '排序';
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

    list.innerHTML = items.map(cardHtml).join('');
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
    warn.textContent = '内容与 github.com/trending 逐条一致（抓取于 ' + when + '）。' + history;

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
    var saved = state.favs[id];
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
    var delta = trend.length ? trend[trend.length - 1] - trend[0] : 0;
    var tags = (item.tags || []).map(function (t) {
      return '<span class="tag">' + esc(t) + '</span>';
    }).join('');

    return (
      '<div class="dbadge">' +
      (item.offList
        ? '📌 已下榜' + (item.ts ? ' · 收藏于 ' + String(timeAgo(item.ts)).replace('更新', '') : '')
        : '⚡ ' + esc(periodLabel(item.fromPeriod || state.period)) + '榜 #' + item.rank) +
      ' · ' + esc(!item.language || item.language === 'Unknown' ? '未标注语言' : item.language) + '</div>' +
      '<h2 class="dname"><span class="owner">' + esc(item.owner) + '/</span>' + esc(item.repo) + '</h2>' +
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
      '<h4>近 30 天 Star 走势<span>' + (delta >= 0 ? '+' : '') + num(delta) + ' ★</span></h4>' +
      '<div class="chart-note">' +
      (item.trendRealPoints >= 30
        ? '全部为真实记录'
        : '真实记录 ' + (item.trendRealPoints || 1) + ' 天，其余按日均增量回推（估算）') +
      '</div>' +
      '<div class="chart-wrap"><canvas id="chart"></canvas></div>' +
      '<div class="axis" id="axis"></div>' +
      '</div>' +
      '<div class="panel">' +
      '<h4>这个项目是做什么的<span>' +
      (item.zhSource === 'auto' ? 'AI 生成' : item.hasZh ? '中文说明' : '暂无中文，下面是原文') +
      '</span></h4>' +
      '<p class="dtext">' + esc(item.detail) + '</p>' +
      (tags ? '<div class="tags">' + tags + '</div>' : '') +
      '</div>' +
      (item.descEn
        ? '<div class="panel"><h4>ORIGINAL DESCRIPTION<span>原文</span></h4><div class="quote">' +
          esc(item.descEn) + '</div></div>'
        : '') +
      '<div class="actions">' +
      '<a class="btn btn-primary" href="' + esc(item.url) + '" target="_blank" rel="noopener">↗ 打开 GitHub</a>' +
      '<button class="btn btn-ghost' + (faved ? ' on' : '') + '" id="btnFavItem">' +
      (faved ? '★ 已收藏' : '☆ 收藏') +
      '</button>' +
      '</div>' +
      '<div style="height:20px"></div>'
    );
  }

  function drawChart(canvas, trend) {
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
  }

  function renderAxis(trend) {
    var el = $('axis');
    if (!el) return;
    var labels = [];
    var n = trend.length;
    var now = Date.now();
    for (var i = 0; i < 5; i++) {
      var idx = Math.round(((n - 1) * i) / 4);
      var d = new Date(now - (n - 1 - idx) * 86400000);
      labels.push(d.getMonth() + 1 + '/' + d.getDate());
    }
    el.innerHTML = labels.map(function (t) {
      return '<span>' + t + '</span>';
    }).join('');
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
        drawChart(canvas, item.trend || []);
        renderAxis(item.trend || []);
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
        if (canvas && item) drawChart(canvas, item.trend || []);
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
      if (canvas && item) drawChart(canvas, item.trend || []);
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





