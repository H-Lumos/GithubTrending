var format = require('../../utils/format.js');

Component({
  options: {
    addGlobalClass: true
  },

  properties: {
    item: {
      type: Object,
      value: {}
    }
  },

  data: {
    grad: '',
    starsText: '',
    hotText: '',
    bars: [],
    hotFrom: 99,
    badge: '',
    badgeType: '',
    showEn: false
  },

  observers: {
    item: function (item) {
      if (!item || !item.id) return;

      var hot = item.hot;
      if (hot == null) {
        hot = (item.delta && item.delta.d) || 0;
      }

      var b = format.toBars(item.trend, 14);

      // 与上一次榜单的位置对比
      var badge = '';
      var badgeType = '';
      if (item.isNew) {
        badge = 'NEW';
        badgeType = 'new';
      } else if (typeof item.rankChange === 'number' && item.rankChange !== 0) {
        badge = (item.rankChange > 0 ? '↑' : '↓') + Math.abs(item.rankChange);
        badgeType = item.rankChange > 0 ? 'up' : 'down';
      }

      this.setData({
        grad: format.thumbGradient(item.languageColor),
        starsText: format.fmtNum(item.stars),
        hotText: format.fmtNum(hot),
        // 4~19px 的柱高按 2 倍换成 rpx
        bars: b.bars.map(function (h) {
          return h * 2;
        }),
        hotFrom: b.hotFrom,
        badge: badge,
        badgeType: badgeType,
        // 快照模式下主文案就是英文原文，这时别再把同一句英文显示第二遍
        showEn:
          !!item.descEn &&
          String(item.descEn).trim() !== String(item.purpose || '').trim()
      });
    }
  },

  methods: {
    onTap: function () {
      this.triggerEvent('opentap', { id: this.data.item.id });
    }
  }
});
