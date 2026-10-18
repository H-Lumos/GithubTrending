var fav = require('../../utils/fav.js');
var format = require('../../utils/format.js');

Page({
  data: {
    theme: 'dark',
    statusBarHeight: 20,
    list: [],
    count: 0
  },

  onLoad: function () {
    var app = getApp();
    this.setData({
      theme: (app && app.globalData.theme) || 'dark',
      statusBarHeight: (app && app.globalData.statusBarHeight) || 20,
      capsuleRight: (app && app.globalData.capsuleRight) || 100
    });
  },

  onShow: function () {
    var app = getApp();
    var theme = (app && app.globalData.theme) || 'dark';
    if (theme !== this.data.theme) this.setData({ theme: theme });
    this.refresh();
  },

  refresh: function () {
    var list = fav
      .getFavs()
      .filter(function (x) {
        return !x.legacy; // 旧版只存了 id 的条目没有快照，无法离线渲染
      })
      .map(function (x) {
        return Object.assign({}, x, {
          grad: format.thumbGradient(x.languageColor),
          starsText: format.fmtNum(x.stars),
          savedText: format.timeAgo(x.savedAt || Date.now()).replace('更新', '')
        });
      });

    this.setData({ list: list, count: list.length });
  },

  onBack: function () {
    var pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.reLaunch({ url: '/pages/trending/index' });
  },

  onOpen: function (e) {
    var id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({
      url: '/pages/detail/index?id=' + encodeURIComponent(id) + '&period=daily'
    });
  },

  onRemove: function (e) {
    var id = e.currentTarget.dataset.id;
    if (!id) return;
    var self = this;
    wx.showModal({
      title: '取消收藏',
      content: '把「' + id + '」从收藏里移除？',
      confirmText: '移除',
      success: function (res) {
        if (!res.confirm) return;
        fav.remove(id);
        self.refresh();
        wx.showToast({ title: '已移除', icon: 'none' });
      }
    });
  },

  onClearAll: function () {
    var self = this;
    wx.showModal({
      title: '清空收藏',
      content: '确定清空全部 ' + this.data.count + ' 个收藏？',
      success: function (res) {
        if (!res.confirm) return;
        fav.clear();
        self.refresh();
      }
    });
  },

  goTrending: function () {
    wx.reLaunch({ url: '/pages/trending/index' });
  }
});
