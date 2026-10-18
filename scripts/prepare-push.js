/**
 * 推送前同步：把「生成物」恢复成远端版本，只保留代码改动。
 *
 * 为什么需要：CI 每天会提交 web/data/trending.js、data/history.json 等生成文件，
 * 本地跑一次 scripts/snapshot.js 也会改同样的文件，两边内容必然不同 →
 * git pull --rebase 每次都冲突（实测一天撞 4 次）。
 *
 * 用法（提交前或推送前都行）：
 *   node scripts/prepare-push.js
 * 然后正常 git add / commit / push。
 */
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** CI 会写、本地也会写 → 一律以远端为准 */
const GENERATED = [
  'web/data/trending.js',
  'miniprogram/data/snapshot.js',
  'data/history.json',
  'data/zh-auto.json'
];

function git(args, opts) {
  const r = spawnSync('git', args, Object.assign({ cwd: ROOT, encoding: 'utf8' }, opts || {}));
  return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}

function main() {
  const remote = git(['remote', 'get-url', 'origin']);
  if (remote.code !== 0) {
    console.error('✖ 没有 origin 远端，无法同步');
    process.exit(1);
  }

  console.log('拉取远端 main …');
  const fetch = git(['fetch', 'origin', 'main']);
  if (fetch.code !== 0) {
    console.error('✖ fetch 失败：' + (fetch.err || fetch.out));
    process.exit(1);
  }

  // 1) 先把工作区对齐远端分支头（不移动本地分支，避免破坏正在做的提交）
  for (const f of GENERATED) {
    const r = git(['checkout', 'FETCH_HEAD', '--', f]);
    if (r.code === 0) console.log('  ↺ ' + f + ' → 远端版本');
    else if (/did not match any file/.test(r.err)) console.log('  - ' + f + '（远端还没有这个文件）');
    else console.log('  ! ' + f + '：' + (r.err || r.out));
  }

  console.log('\n完成。生成物已对齐远端，可以只提交代码改动了。');
  console.log('提示：如果本地分支落后远端，再执行 git pull --rebase 就不会冲突。');
}

main();
