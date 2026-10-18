Component({
  options: {
    addGlobalClass: true
  },

  properties: {
    rows: {
      type: Number,
      value: 4
    }
  },

  data: {
    list: [0, 1, 2, 3]
  },

  observers: {
    rows: function (rows) {
      var arr = [];
      for (var i = 0; i < (rows || 4); i++) arr.push(i);
      this.setData({ list: arr });
    }
  }
});
