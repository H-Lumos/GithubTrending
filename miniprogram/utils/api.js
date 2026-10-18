/**
 * 数据层：mock / 云函数 / 自建 HTTP 三选一，统一输出同一种结构
 *
 * 返回结构：
 * {
 *   ok: true,
 *   period: 'daily'|'weekly'|'monthly',
 *   language: '',
 *   generatedAt: 1690000000000,
 *   source: 'mock'|'cloud'|'http'|'cache',
 *   items: [{
 *     id, rank, fullName, owner, repo, url,
 *     descEn, purpose, detail, tags,
 *     language, languageColor, stars, forks, license,
 *     hot,            // 当前周期新增 star
 *     trend: [n...]   // 近 30 天累计 star
 *   }]
 * }
 */
var config = require('../config.js');
var mockData = require('../data/mock.js');

// 官方榜单快照（由 scripts/snapshot.js 生成）。缺失时该模式自动不可用。
var snapshot = null;
var snapshotLoadError = '';
try {
  snapshot = require('../data/snapshot.js');
} catch (e) {
  snapshotLoadError = (e && e.message) || 'unknown';
  console.warn('[snapshot] 加载失败：' + snapshotLoadError);
}

var memoryCache = {};

function cacheKey(period, language) {
  // 带上 MODE：切换数据源后不能复用旧缓存（否则会拿 mock 数据冒充快照）
  return config.MODE + ':' + period + ':' + (language || 'all');
}

/** 清空内存缓存（切换数据源、下拉刷新强制重取时用） */
function clearCache() {
  memoryCache = {};
}

/** slug → 显示名（筛选传 slug，数据里存显示名） */
function displayNameOf(language, list) {
  var src = list || (snapshot && snapshot.languages) || mockData.languages;
  for (var i = 0; i < src.length; i++) {
    if (src[i].value === language) return src[i].name;
  }
  return language;
}

function snapshotPayload(period, language) {
  if (!snapshot || !snapshot.periods || !snapshot.periods[period]) return null;
  var list = snapshot.periods[period].slice();
  if (language) {
    var display = displayNameOf(language, snapshot.languages);
    list = list.filter(function (r) {
      return r.language === display;
    });
  }
  return {
    ok: true,
    period: period,
    language: language || '',
    generatedAt: snapshot.generatedAt,
    source: 'snapshot',
    languages: snapshot.languages,
    items: list
  };
}

function mockPayload(period, language) {
  var list = mockData.trending(period);
  if (language) {
    // 筛选传进来的是 slug（如 typescript），mock 数据里存的是显示名（TypeScript），要先映射
    var display = displayNameOf(language, mockData.languages);
    list = list.filter(function (r) {
      return r.language === display;
    });
  }
  return {
    ok: true,
    period: period,
    language: language || '',
    generatedAt: Date.now(),
    source: 'mock',
    languages: mockData.languages,
    items: list
  };
}

function fromCloud(period, language) {
  return new Promise(function (resolve, reject) {
    if (!wx.cloud) {
      reject(new Error('当前基础库不支持云开发'));
      return;
    }
    wx.cloud.callFunction({
      name: 'getTrending',
      data: { period: period, language: language || '' },
      success: function (res) {
        var r = res && res.result;
        if (!r || r.ok === false) {
          reject(new Error((r && r.message) || '云函数返回异常'));
          return;
        }
        r.source = 'cloud';
        resolve(r);
      },
      fail: function (err) {
        reject(new Error((err && err.errMsg) || '云函数调用失败'));
      }
    });
  });
}

function fromHttp(period, language) {
  return new Promise(function (resolve, reject) {
    if (!config.API_BASE) {
      reject(new Error('未配置 API_BASE'));
      return;
    }
    wx.request({
      url: config.API_BASE + '/trending',
      data: { period: period, language: language || '' },
      timeout: 12000,
      success: function (res) {
        if (res.statusCode !== 200 || !res.data || !res.data.items) {
          reject(new Error('接口返回 HTTP ' + res.statusCode));
          return;
        }
        res.data.source = 'http';
        resolve(res.data);
      },
      fail: function (err) {
        reject(new Error((err && err.errMsg) || '网络请求失败'));
      }
    });
  });
}

/**
 * 拉取榜单
 * @param {Object} opts { period, language, force }
 */
function fetchTrending(opts) {
  opts = opts || {};
  var period = opts.period || 'daily';
  var language = opts.language || '';
  var key = cacheKey(period, language);

  var hit = memoryCache[key];
  if (!opts.force && hit && Date.now() - hit.ts < config.CACHE_TTL) {
    var copy = JSON.parse(JSON.stringify(hit.payload));
    // 保留原始 source（官方榜单快照/云函数…），只额外标记来自缓存
    copy.fromCache = true;
    return Promise.resolve(copy);
  }

  var task;
  if (config.MODE === 'cloud') task = fromCloud(period, language);
  else if (config.MODE === 'http') task = fromHttp(period, language);
  else if (config.MODE === 'snapshot') {
    var snap = snapshotPayload(period, language);
    task = snap
      ? Promise.resolve(snap)
      : Promise.reject(
          new Error(
            '快照数据缺失' + (snapshotLoadError ? '（' + snapshotLoadError + '）' : '') +
              '，请执行 node scripts/snapshot.js 后重新编译'
          )
        );
  } else task = Promise.resolve(mockPayload(period, language));

  return task.then(function (payload) {
    memoryCache[key] = { ts: Date.now(), payload: payload };
    return payload;
  });
}

/** 从已缓存数据里按 id 找一条，找不到返回 null */
function findCached(id) {
  var keys = Object.keys(memoryCache);
  for (var i = 0; i < keys.length; i++) {
    var items = memoryCache[keys[i]].payload.items || [];
    for (var j = 0; j < items.length; j++) {
      if (items[j].id === id) return items[j];
    }
  }
  // 快照里也找一遍（详情页从分享链接进来时用得上）
  if (snapshot && snapshot.periods) {
    var ps = Object.keys(snapshot.periods);
    for (var k = 0; k < ps.length; k++) {
      var arr = snapshot.periods[ps[k]] || [];
      for (var m = 0; m < arr.length; m++) {
        if (arr[m].id === id) return arr[m];
      }
    }
  }
  var all = mockData.all();
  for (var n = 0; n < all.length; n++) {
    if (all[n].id === id) return all[n];
  }
  return null;
}

/** 详情：优先缓存；cloud 模式下可再拉详情云函数 */
function fetchDetail(id, period) {
  var cached = findCached(id);
  if (cached) return Promise.resolve(cached);
  if (config.MODE === 'mock') return Promise.resolve(null);

  return new Promise(function (resolve, reject) {
    wx.cloud.callFunction({
      name: 'getTrending',
      data: { action: 'detail', id: id, period: period || 'daily' },
      success: function (res) {
        var r = res && res.result;
        if (r && r.ok && r.item) resolve(r.item);
        else resolve(null);
      },
      fail: function () {
        resolve(null);
      }
    });
  });
}

module.exports = {
  fetchTrending: fetchTrending,
  fetchDetail: fetchDetail,
  findCached: findCached,
  clearCache: clearCache
};
