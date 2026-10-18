Component({
  options: {
    addGlobalClass: true
  },

  properties: {
    list: {
      type: Array,
      value: []
    },
    value: {
      type: String,
      value: ''
    }
  },

  methods: {
    onTap: function (e) {
      var value = e.currentTarget.dataset.value || '';
      if (value === this.data.value) return;
      this.triggerEvent('change', { value: value });
    }
  }
});
