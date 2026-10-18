/**
 * 云函数 syncStars（定时触发）
 * ---------------------------------------------------------------------------
 * 每天做两件事：
 *   1. star 快照  → star_history   { id, d, stars }      用于详情页 30 天趋势图
 *   2. 名次快照   → rank_snapshots { period, d, ids[] }   用于「新上榜 / ↑N / ↓N」
 *
 * 实现要点：
 *   不再自己抓 GitHub（/trending 已改为前端渲染，HTML 里没有数据），
 *   而是直接调用 getTrending 云函数取结果，保证「榜单口径」只有一个来源。
 *   调用时带 skipZh: true —— 定时任务只关心 stars 和名次，不触发生成中文（省时省钱）。
 *
 * ⚠️ 部署后请在云开发控制台把本函数「超时时间」调到 60 秒：
 *    并联 3 次 getTrending 约需 5~10 秒，默认 3 秒会超时。
 *
 * 部署后到「触发器」确认 syncStarsTimer 已创建，或手动测试运行一次灌首批数据。
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const PERIODS = ['daily', 'weekly', 'monthly'];

function dayStr(offsetDays) {
  const d = new Date(Date.now() + (offsetDays || 0) * 86400000);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
}

exports.main = async function () {
  const today = dayStr(0);
  const errors = [];
  const counts = {};

  /* ---------- 1. 并发取三个周期的榜单 ---------- */
  const results = await Promise.all(
    PERIODS.map(async function (period) {
      try {
        const r = await cloud.callFunction({
          name: 'getTrending',
          data: { period: period, language: '', skipZh: true }
        });
        const res = r && r.result;
        if (!res || !res.ok) {
          return { period: period, items: [], error: (res && res.message) || '返回结构异常' };
        }
        return { period: period, items: res.items || [] };
      } catch (e) {
        return { period: period, items: [], error: e.message || '调用失败' };
      }
    })
  );

  const starsMap = {};
  const rankByPeriod = {};

  results.forEach(function (r) {
    counts[r.period] = r.items.length;
    if (r.error) errors.push(r.period + ': ' + r.error);

    rankByPeriod[r.period] = r.items.map(function (i) {
      return i.id;
    });
    r.items.forEach(function (i) {
      if (i.id && i.stars) starsMap[i.id] = i.stars;
    });
  });

  const ids = Object.keys(starsMap);
  if (!ids.length) {
    return { ok: false, message: '三个周期都没拿到数据', counts: counts, errors: errors };
  }

  /* ---------- 2. star 快照（当天已写过的跳过） ---------- */
  const exists = {};
  try {
    const r = await db
      .collection('star_history')
      .where({ id: _.in(ids), d: today })
      .limit(1000)
      .get();
    (r.data || []).forEach(function (row) {
      exists[row.id] = true;
    });
  } catch (e) {
    errors.push('读 star_history: ' + e.message);
  }

  let starsWritten = 0;
  for (let k = 0; k < ids.length; k++) {
    if (exists[ids[k]]) continue;
    try {
      await db.collection('star_history').add({
        data: { id: ids[k], d: today, stars: starsMap[ids[k]], ts: Date.now() }
      });
      starsWritten++;
    } catch (e) {
      if (errors.length < 6) errors.push('写 star_history(' + ids[k] + '): ' + e.message);
    }
  }

  /* ---------- 3. 名次快照（用 doc().set 做幂等覆盖） ---------- */
  let ranksWritten = 0;
  for (let i = 0; i < PERIODS.length; i++) {
    const period = PERIODS[i];
    const list = rankByPeriod[period] || [];
    if (!list.length) continue;
    try {
      await db
        .collection('rank_snapshots')
        .doc(period + '_' + today)
        .set({
          data: { period: period, d: today, ids: list, count: list.length, ts: Date.now() }
        });
      ranksWritten++;
    } catch (e) {
      errors.push('写 rank_snapshots(' + period + '): ' + e.message);
    }
  }

  /* ---------- 4. 清理 40 天前旧数据（每次一批，避免超时） ---------- */
  let pruned = 0;
  const collections = ['star_history', 'rank_snapshots'];
  for (let c = 0; c < collections.length; c++) {
    try {
      const old = await db
        .collection(collections[c])
        .where({ d: _.lt(dayStr(-40)) })
        .limit(200)
        .get();
      const rows = old.data || [];
      for (let m = 0; m < rows.length; m++) {
        await db.collection(collections[c]).doc(rows[m]._id).remove();
        pruned++;
      }
    } catch (e) {
      errors.push('清理 ' + collections[c] + ': ' + e.message);
    }
  }

  return {
    ok: true,
    date: today,
    counts: counts,
    uniqueRepos: ids.length,
    starsWritten: starsWritten,
    ranksWritten: ranksWritten,
    pruned: pruned,
    errors: errors.slice(0, 6)
  };
};
