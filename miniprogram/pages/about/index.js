var config = require('../../config.js');
var fav = require('../../utils/fav.js');

var MODE_TEXT = {
  mock: '本地演示数据（无需云环境）',
  cloud: '微信云开发 · getTrending 云函数',
  http: '自建 HTTP 接口 · ' + (config.API_BASE || '未配置')
};

Page({
  data: {
    theme: 'dark',
    statusBarHeight: 20,
    version: config.VERSION,
    modeText: '',
    favCount: 0
  },

  onLoad: function () {
    var app = getApp();
    this.setData({
      theme: (app && app.globalData.theme) || 'dark',
      statusBarHeight: (app && app.globalData.statusBarHeight) || 20,
      capsuleRight: (app && app.globalData.capsuleRight) || 100,
      modeText: MODE_TEXT[config.MODE] || config.MODE
    });
  },

  onShow: function () {
    this.setData({ favCount: fav.getFavs().length });
  },

  onBack: function () {
    var pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.reLaunch({ url: '/pages/trending/index' });
  },

  switchTheme: function () {
    var next = this.data.theme === 'dark' ? 'light' : 'dark';
    var app = getApp();
    if (app && app.setTheme) app.setTheme(next);
    this.setData({ theme: next });
  },

  clearFavs: function () {
    var self = this;
    wx.showModal({
      title: '清空收藏',
      content: '确定要清空本地收藏的项目吗？',
      success: function (res) {
        if (!res.confirm) return;
        fav.clear();
        self.setData({ favCount: 0 });
        wx.showToast({ title: '已清空', icon: 'none' });
      }
    });
  },

  copySource: function () {
    wx.setClipboardData({
      data: 'https://github.com/trending',
      success: function () {
        wx.showToast({ title: '已复制 GitHub Trending 地址', icon: 'none' });
      }
    });
  }
});
