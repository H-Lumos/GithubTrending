var api = require('../../utils/api.js');
var format = require('../../utils/format.js');
var fav = require('../../utils/fav.js');
var config = require('../../config.js');

Page({
  data: {
    theme: 'dark',
    statusBarHeight: 20,
    safeBottom: 0,
    period: 'daily',
    item: null,
    loading: true,
    starsText: '',
    hotText: '',
    forkText: '',
    hotLabel: '今日新增',
    badgeText: '',
    rangeText: '',
    axis: [],
    rankNote: '',
    faved: false,
    chartFailed: false
  },

  onLoad: function (q) {
    var app = getApp();
    var id = q.id ? decodeURIComponent(q.id) : '';
    var period = q.period || 'daily';

    var periodCfg = null;
    for (var i = 0; i < config.PERIODS.length; i++) {
      if (config.PERIODS[i].value === period) periodCfg = config.PERIODS[i];
    }

    this.setData({
      theme: (app && app.globalData.theme) || 'dark',
      statusBarHeight: (app && app.globalData.statusBarHeight) || 20,
      safeBottom: (app && app.globalData.safeBottom) || 0,
      capsuleRight: (app && app.globalData.capsuleRight) || 100,
      period: period,
      hotLabel: (periodCfg ? periodCfg.label : '今日') + '新增'
    });

    if (!id) {
      this.setData({ loading: false });
      return;
    }
    this.loadDetail(id, period);
  },

  onReady: function () {
    // 保证首次渲染后再画一次（防止 canvas 尺寸未就绪）
    if (this.data.item) this.drawChart();
  },

  loadDetail: function (id, period) {
    var self = this;
    api
      .fetchDetail(id, period)
      .then(function (item) {
        if (!item) {
          self.setData({ loading: false, item: null });
          return;
        }

        var hot = item.hot;
        if (hot == null) hot = (item.delta && item.delta[period === 'weekly' ? 'w' : period === 'monthly' ? 'm' : 'd']) || 0;

        var trend = item.trend || [];
        var rangeText = '';
        if (trend.length > 1) {
          rangeText = '+' + format.fmtInt(trend[trend.length - 1] - trend[0]) + ' ★';
        }

        // x 轴日期：以今天为最后一天，向前推 trend.length-1 天
        var axis = [];
        var n = trend.length;
        var picks = [0, Math.round((n - 1) / 4), Math.round((n - 1) / 2), Math.round((n - 1) * 0.75), n - 1];
        for (var i = 0; i < picks.length; i++) {
          var back = n - 1 - picks[i];
          axis.push(format.fmtShortDate(Date.now() - back * 86400000));
        }

        var favs = fav.getFavs();

        // 与上一次榜单对比的位置变化
        var rankNote = '';
        if (item.isNew) {
          rankNote = '比上次榜单：新上榜';
        } else if (typeof item.rankChange === 'number') {
          if (item.rankChange > 0) rankNote = '比上次榜单：↑ ' + item.rankChange + ' 位';
          else if (item.rankChange < 0) rankNote = '比上次榜单：↓ ' + Math.abs(item.rankChange) + ' 位';
          else rankNote = '比上次榜单：持平';
        }

        self.setData(
          {
            item: item,
            loading: false,
            starsText: format.fmtInt(item.stars),
            hotText: format.fmtNum(hot),
            forkText: format.fmtNum(item.forks),
            badgeText:
              (self.data.hotLabel.replace('新增', '') + '榜' +
                (item.rank ? ' #' + item.rank : '') +
                ' · ' + item.language),
            rangeText: rangeText,
            axis: axis,
            rankNote: rankNote,
            faved: favs.some(function (x) {
              return x.id === item.id;
            })
          },
          function () {
            wx.nextTick(function () {
              self.drawChart();
            });
          }
        );
      })
      .catch(function () {
        self.setData({ loading: false, item: null });
      });
  },

  /* ---------------- 30 天趋势图（canvas 2d） ---------------- */

  drawChart: function () {
    var self = this;
    var item = this.data.item;
    if (!item || !item.trend || item.trend.length < 2) return;

    var trend = item.trend;
    var light = this.data.theme === 'light';
    var min = Math.min.apply(null, trend);
    var max = Math.max.apply(null, trend);
    var span = Math.max(1, max - min);

    var query = wx.createSelectorQuery();
    query
      .select('#trendCanvas')
      .fields({ node: true, size: true })
      .exec(function (res) {
        var info = res && res[0];
        if (!info || !info.node) {
          self.setData({ chartFailed: true });
          return;
        }

        var canvas = info.node;
        var ctx = canvas.getContext('2d');
        if (!ctx) {
          self.setData({ chartFailed: true });
          return;
        }

        var dpr = 2;
        try {
          dpr = (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || 2;
        } catch (e) {}

        var W = info.width || 300;
        var H = info.height || 110;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, W, H);

        var padL = 2;
        var padR = 7;
        var padT = 10;
        var padB = 10;
        var iw = W - padL - padR;
        var ih = H - padT - padB;

        function px(i) {
          return padL + (iw * i) / (trend.length - 1);
        }
        function py(v) {
          return padT + ih - ((v - min) / span) * ih;
        }

        // 参考网格
        ctx.strokeStyle = light ? 'rgba(31,35,40,0.08)' : 'rgba(255,255,255,0.055)';
        ctx.lineWidth = 1;
        for (var g = 0; g <= 3; g++) {
          var gy = padT + (ih * g) / 3;
          ctx.beginPath();
          ctx.moveTo(padL, gy);
          ctx.lineTo(W - padR, gy);
          ctx.stroke();
        }

        // 面积渐变
        var grad = ctx.createLinearGradient(0, padT, 0, padT + ih);
        grad.addColorStop(0, light ? 'rgba(9,105,218,0.24)' : 'rgba(79,156,249,0.38)');
        grad.addColorStop(1, 'rgba(79,156,249,0)');

        ctx.beginPath();
        ctx.moveTo(px(0), py(trend[0]));
        for (var i = 1; i < trend.length; i++) ctx.lineTo(px(i), py(trend[i]));
        ctx.lineTo(px(trend.length - 1), padT + ih);
        ctx.lineTo(px(0), padT + ih);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // 折线
        ctx.beginPath();
        ctx.moveTo(px(0), py(trend[0]));
        for (var j = 1; j < trend.length; j++) ctx.lineTo(px(j), py(trend[j]));
        ctx.strokeStyle = light ? '#0969da' : '#6cb6ff';
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();

        // 末点
        var lx = px(trend.length - 1);
        var ly = py(trend[trend.length - 1]);
        ctx.beginPath();
        ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = light ? '#ffffff' : '#0b0e14';
        ctx.fill();
        ctx.strokeStyle = light ? '#0969da' : '#8fc4ff';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
  },

  /* ---------------- 交互 ---------------- */

  onBack: function () {
    var pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.reLaunch({ url: '/pages/trending/index' });
  },

  onFav: function () {
    var item = this.data.item;
    if (!item) return;

    var nowFaved = fav.toggle(item);
    wx.showToast({ title: nowFaved ? '已收藏' : '已取消收藏', icon: 'none' });
    this.setData({ faved: nowFaved });
  },

  /**
   * 小程序不能直接跳外部链接，这里复制到剪贴板
   */
  onOpen: function () {
    var item = this.data.item;
    if (!item) return;
    wx.setClipboardData({
      data: item.url,
      success: function () {
        wx.showToast({ title: '链接已复制，去浏览器粘贴', icon: 'none', duration: 2200 });
      }
    });
  },

  onShareAppMessage: function () {
    var item = this.data.item;
    return {
      title: item ? item.repo + ' · ' + item.purpose : 'GitHub 热榜',
      path: '/pages/detail/index?id=' + encodeURIComponent(item ? item.id : '')
    };
  }
});
