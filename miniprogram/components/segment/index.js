Component({
  options: {
    addGlobalClass: true
  },

  properties: {
    items: {
      type: Array,
      value: []
    },
    value: {
      type: String,
      value: ''
    }
  },

  data: {
    activeIndex: 0
  },

  observers: {
    'items, value': function (items, value) {
      if (!items || !items.length) return;
      var idx = 0;
      for (var i = 0; i < items.length; i++) {
        if (items[i].value === value) {
          idx = i;
          break;
        }
      }
      this.setData({ activeIndex: idx });
    }
  },

  methods: {
    onTap: function (e) {
      var idx = Number(e.currentTarget.dataset.index);
      if (idx === this.data.activeIndex) return;
      var item = this.data.items[idx];
      if (!item) return;
      this.setData({ activeIndex: idx });
      this.triggerEvent('change', { value: item.value, label: item.label });
    }
  }
});
