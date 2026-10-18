App({
  globalData: {
    statusBarHeight: 20,
    navBarHeight: 44,
    safeBottom: 0,
    capsuleRight: 100,
    theme: 'dark',
    MODE: 'mock'
  },

  onLaunch: function () {
    var config = require('./config.js');
    this.globalData.MODE = config.MODE;

    var info = null;
    try {
      info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    } catch (e) {
      info = wx.getSystemInfoSync();
    }

    this.globalData.statusBarHeight = info.statusBarHeight || 20;
    this.globalData.safeBottom = info.safeArea
      ? Math.max(0, (info.screenHeight || 0) - info.safeArea.bottom)
      : 0;

    // 右上角原生胶囊（··· ⊙）会盖住自定义导航的按钮，按它的实际位置预留出右侧空间
    try {
      var rect = wx.getMenuButtonBoundingClientRect();
      var winW = info.windowWidth || info.screenWidth || 375;
      this.globalData.capsuleRight = Math.max(0, winW - rect.left + 8);
      // 自定义导航栏高度 = 胶囊上下留白 * 2 + 胶囊高度（标准算法）
      this.globalData.navBarHeight =
        (rect.top - info.statusBarHeight) * 2 + rect.height;
    } catch (e) {
      this.globalData.capsuleRight = 100;
    }

    // 主题：默认深色（GitHub 原生观感），用户可手动切换
    var saved = '';
    try {
      saved = wx.getStorageSync('ght:theme');
    } catch (e) {}
    this.globalData.theme = saved || 'dark';

    if (config.MODE === 'cloud' && wx.cloud) {
      try {
        wx.cloud.init({
          env: config.CLOUD_ENV || wx.cloud.DYNAMIC_CURRENT_ENV,
          traceUser: true
        });
      } catch (e) {
        console.error('[cloud] init failed', e);
      }
    }
  },

  setTheme: function (theme) {
    this.globalData.theme = theme;
    try {
      wx.setStorageSync('ght:theme', theme);
    } catch (e) {}
  }
});
