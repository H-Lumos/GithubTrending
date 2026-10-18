/**
 * 云函数 seedZh
 * 把 seeds.json 里的人工中文文案一次性灌进 repo_zh 缓存，
 * 让热门项目首次出现就用高质量人工文案，而不是等模型生成。
 *
 * 用法：
 *   1) node scripts/build-seeds.js        生成本目录下的 seeds.json
 *   2) 右键本函数 → 上传并部署：云端安装依赖
 *   3) 云开发控制台 → 云函数 → seedZh → 测试运行，事件填 {}
 *      想覆盖已有文案（比如模型生成过的）：事件填 {"force": true}
 *
 * 幂等：默认只写「不存在的」条目，重复运行不会覆盖已有文案。
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

let seeds = [];
try {
  seeds = require('./seeds.json');
} catch (e) {
  console.warn('[seed] seeds.json 未找到，请先执行 node scripts/build-seeds.js');
}

function docId(fullName) {
  return fullName.replace(/[\/\\]/g, '__');
}

exports.main = async function (event) {
  const force = !!(event && event.force);

  if (!Array.isArray(seeds) || !seeds.length) {
    return { ok: false, message: 'seeds.json 为空，先在本地跑 node scripts/build-seeds.js 再部署' };
  }

  let written = 0;
  let skipped = 0;
  const failed = [];
  const created = [];
  const overwritten = [];

  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i];
    const id = docId(s.fullName);

    if (!force) {
      let exists = false;
      try {
        const got = await db.collection('repo_zh').doc(id).get();
        exists = !!(got && got.data);
      } catch (e) {
        exists = false; // doc 不存在时 get 会抛错，视为不存在
      }
      if (exists) {
        skipped++;
        continue;
      }
    }

    try {
      await db
        .collection('repo_zh')
        .doc(id)
        .set({
          data: {
            fullName: s.fullName,
            purpose: s.purpose,
            detail: s.detail,
            tags: s.tags || [],
            updatedAt: Date.now(),
            seeded: true
          }
        });
      written++;
      (force ? overwritten : created).push(s.fullName);
    } catch (e) {
      failed.push(s.fullName + ': ' + e.message);
    }
  }

  return {
    ok: failed.length === 0,
    total: seeds.length,
    written: written,
    skipped: skipped,
    failed: failed.slice(0, 8),
    force: force,
    sample: (force ? overwritten : created).slice(0, 5)
  };
};
