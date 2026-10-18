/** 数字/日期格式化 */

function fmtNum(n) {
  n = Number(n) || 0;
  if (n >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, '') + '亿';
  if (n >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, '') + '万';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

function fmtInt(n) {
  n = Number(n) || 0;
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function pad(n) {
  return n < 10 ? '0' + n : String(n);
}

function fmtDate(ts, withTime) {
  var d = ts ? new Date(ts) : new Date();
  var base = d.getMonth() + 1 + '月' + d.getDate() + '日';
  if (!withTime) return base;
  return base + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function fmtShortDate(ts) {
  var d = new Date(ts);
  return d.getMonth() + 1 + '/' + pad(d.getDate());
}

function timeAgo(ts) {
  var diff = Math.max(0, Date.now() - new Date(ts).getTime());
  var m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚更新';
  if (m < 60) return m + ' 分钟前更新';
  var h = Math.floor(m / 60);
  if (h < 24) return h + ' 小时前更新';
  return Math.floor(h / 24) + ' 天前更新';
}

/** 语言色 → 缩略图渐变 */
function thumbGradient(color, initial) {
  var c = color || '#8b949e';
  return 'linear-gradient(145deg,' + c + 'dd,' + c + '55 65%, #1b2430)';
}

/** 把 star 历史切成迷你柱 */
function toBars(trend, maxBars) {
  var arr = (trend || []).slice(-(maxBars || 14));
  if (!arr.length) return { bars: [], hotFrom: 0 };
  var min = Math.min.apply(null, arr);
  var max = Math.max.apply(null, arr);
  var span = Math.max(1, max - min);
  return {
    bars: arr.map(function (v) {
      return 4 + Math.round(((v - min) / span) * 15);
    }),
    hotFrom: Math.max(0, arr.length - 3)
  };
}

module.exports = {
  fmtNum: fmtNum,
  fmtInt: fmtInt,
  fmtDate: fmtDate,
  fmtShortDate: fmtShortDate,
  timeAgo: timeAgo,
  thumbGradient: thumbGradient,
  toBars: toBars
};
