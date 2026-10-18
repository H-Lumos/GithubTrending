var api = require('../../utils/api.js');
var config = require('../../config.js');
var format = require('../../utils/format.js');
var mockData = require('../../data/mock.js');

// 真实数据源未返回语言清单时的兜底
var DEFAULT_LANGS = [
  { name: '全部', value: '', color: '' },
  { name: 'Python', value: 'python', color: '#3572A5' },
  { name: 'TypeScript', value: 'typescript', color: '#3178c6' },
  { name: 'JavaScript', value: 'javascript', color: '#f1e05a' },
  { name: 'Go', value: 'go', color: '#00ADD8' },
  { name: 'Rust', value: 'rust', color: '#dea584' },
  { name: 'C++', value: 'c++', color: '#f34b7d' },
  { name: 'Java', value: 'java', color: '#b07219' },
  { name: 'Shell', value: 'shell', color: '#89e051' }
];

var SOURCE_TEXT = {
  official: '官方 Trending 榜单',
  'official+search': '官方榜单 + 搜索补充',
  search: 'GitHub 搜索近似（按涨星速度）',
  snapshot: '官方榜单快照',
  cloud: '云函数',
  mock: '内置演示数据',
  cache: '本地缓存',
  none: '暂无数据'
};

Page({
  data: {
    theme: 'dark',
    statusBarHeight: 20,
    periods: config.PERIODS,
    period: 'daily',
    unitLabel: '今日新增',
    langList: [],
    language: '',
    list: [],
    count: 0,
    favCount: 0,
    loading: true,
    refreshing: false,
    error: '',
    updatedText: '',
    sourceText: '',
    sourceIsSnapshot: false,
    scrollTop: 0
  },

  onLoad: function () {
    var app = getApp();
    var theme = (app && app.globalData.theme) || 'dark';
    var statusBarHeight = (app && app.globalData.statusBarHeight) || 20;

    // mock 模式下直接用本地语言清单，真实模式先用兜底、请求回来后覆盖
    var langList = config.MODE === 'mock' ? mockData.languages : DEFAULT_LANGS;

    this.setData({
      theme: theme,
      statusBarHeight: statusBarHeight,
      capsuleRight: (app && app.globalData.capsuleRight) || 100,
      langList: langList
    });

    this.load();
  },

  onShow: function () {
    var app = getApp();
    var theme = (app && app.globalData.theme) || 'dark';
    var favCount = 0;
    try {
      favCount = require('../../utils/fav.js').getFavs().filter(function (x) {
        return !x.legacy;
      }).length;
    } catch (e) {}

    if (theme !== this.data.theme || favCount !== this.data.favCount) {
      this.setData({ theme: theme, favCount: favCount });
    }
  },

  /* ---------------- 滚动位置 ---------------- */

  // 只记录，不 setData（滚动中频繁 setData 会抖）
  onScroll: function (e) {
    this._scrollTop = e.detail.scrollTop;
  },

  /**
   * 强制回到顶部。
   * 两步赋值：先写一个和当前不同的值，再写 0 —— 否则 setData 相同值不会触发 scroll-view 滚动。
   */
  resetScrollTop: function () {
    var self = this;
    this.setData({ scrollTop: (this._scrollTop || 0) + 1 }, function () {
      self.setData({ scrollTop: 0 });
    });
    this._scrollTop = 0;
  },

  /* ---------------- 数据加载 ---------------- */

  load: function (opts) {
    opts = opts || {};
    var self = this;
    var period = this.data.period;
    var language = this.data.language;

    if (!this.data.list.length) {
      this.setData({ loading: true, error: '' });
    }

    return api
      .fetchTrending({ period: period, language: language, force: !!opts.force })
      .then(function (payload) {
        var items = payload.items || [];
        var src = payload.dataSource || payload.source;
        var srcText = SOURCE_TEXT[src] || '';
        // 快照是静态的，把生成时间明确写出来，别让人误以为是实时
        if (src === 'snapshot' && payload.generatedAt) {
          srcText += ' · ' + format.fmtDate(payload.generatedAt, true);
        }
        self.setData(
          {
            list: items,
            count: items.length,
            loading: false,
            error: '',
            updatedText: format.timeAgo(payload.generatedAt || Date.now()),
            sourceText: srcText,
            sourceIsSnapshot: src === 'snapshot',
            langList:
              payload.languages && payload.languages.length
                ? payload.languages
                : self.data.langList
          },
          function () {
            // 首次拿到数据 / 换了周期或语言后，回到顶部
            self.resetScrollTop();
          }
        );
      })
      .catch(function (err) {
        self.setData({
          loading: false,
          error: (err && err.message) || '加载失败，请稍后重试'
        });
      })
      .then(function () {
        if (self.data.refreshing) self.setData({ refreshing: false });
      });
  },

  /* ---------------- 交互 ---------------- */

  onPeriod: function (e) {
    var value = e.detail.value;
    var label = e.detail.label;
    this.resetScrollTop();
    this.setData(
      {
        period: value,
        unitLabel: label + '新增',
        list: [],
        count: 0,
        loading: true
      },
      this.load
    );
  },

  onLang: function (e) {
    this.resetScrollTop();
    this.setData(
      {
        language: e.detail.value,
        list: [],
        count: 0,
        loading: true
      },
      this.load
    );
  },

  onRefresh: function () {
    this.setData({ refreshing: true });
    this.load({ force: true });
  },

  onRetry: function () {
    this.load({ force: true });
  },

  onResetLang: function () {
    this.setData({ language: '', list: [], loading: true }, this.load);
  },

  openDetail: function (e) {
    var id = e.detail.id;
    if (!id) return;
    wx.navigateTo({
      url: '/pages/detail/index?id=' + encodeURIComponent(id) + '&period=' + this.data.period
    });
  },

  goAbout: function () {
    wx.navigateTo({ url: '/pages/about/index' });
  },

  goFavorites: function () {
    wx.navigateTo({ url: '/pages/favorites/index' });
  },

  onShareAppMessage: function () {
    return {
      title: 'GitHub 今日热榜 · 中文一句话看懂项目在做什么',
      path: '/pages/trending/index'
    };
  }
});
