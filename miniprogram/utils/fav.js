/**
 * 收藏（本地快照）
 * 设计取舍：收藏时把项目的最小快照整个存进 storage，而不是只存 id。
 * 好处：收藏页离线秒开、不依赖云函数；坏处：star 数是收藏那一刻的值（页面上会标注）。
 */
var KEY = 'ght:favs:v2';

function normalize(list) {
  if (!Array.isArray(list)) return [];
  // 兼容旧版：只存了 id 字符串
  return list.map(function (x) {
    if (typeof x === 'string') return { id: x, legacy: true };
    return x;
  });
}

function getFavs() {
  var raw = [];
  try {
    raw = wx.getStorageSync(KEY) || wx.getStorageSync('ght:favs') || [];
  } catch (e) {}
  return normalize(raw);
}

function saveFavs(list) {
  try {
    wx.setStorageSync(KEY, list);
  } catch (e) {}
}

function isFaved(id) {
  return getFavs().some(function (x) {
    return x.id === id;
  });
}

/** 收藏/取消收藏，返回操作后是否处于已收藏状态 */
function toggle(item) {
  var list = getFavs();
  var idx = -1;
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === item.id) {
      idx = i;
      break;
    }
  }

  if (idx > -1) {
    list.splice(idx, 1);
    saveFavs(list);
    return false;
  }

  list.unshift({
    id: item.id,
    owner: item.owner,
    repo: item.repo,
    fullName: item.fullName,
    url: item.url,
    purpose: item.purpose,
    descEn: item.descEn,
    language: item.language,
    languageColor: item.languageColor,
    stars: item.stars,
    hot: item.hot || 0,
    initial: item.initial || (item.repo || '?').charAt(0).toUpperCase(),
    trend: item.trend || [],
    savedAt: Date.now()
  });
  saveFavs(list);
  return true;
}

function remove(id) {
  var list = getFavs().filter(function (x) {
    return x.id !== id;
  });
  saveFavs(list);
  return list;
}

function clear() {
  try {
    wx.removeStorageSync(KEY);
    wx.removeStorageSync('ght:favs');
  } catch (e) {}
}

module.exports = {
  KEY: KEY,
  getFavs: getFavs,
  isFaved: isFaved,
  toggle: toggle,
  remove: remove,
  clear: clear
};
