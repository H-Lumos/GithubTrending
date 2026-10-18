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

  // 关键：恢复成【本地 HEAD】的版本，而不是远端版本。
  // 冲突的根源是「本地重新生成的内容」和 CI 提交的内容不同；
  // 只要提交里不含生成物改动，rebase 到新远端时就不会冲突。
  let changed = 0;
  for (const f of GENERATED) {
    const r = git(['checkout', 'HEAD', '--', f]);
    if (r.code === 0) {
      console.log('  ↺ ' + f + ' → 丢弃本地生成内容，恢复为 HEAD 版本');
      changed++;
    } else if (/did not match any file/.test(r.err)) {
      console.log('  - ' + f + '（HEAD 里还没有这个文件）');
    } else {
      console.log('  ! ' + f + '：' + (r.err || r.out));
    }
  }

  const behind = git(['rev-list', '--count', 'HEAD..origin/main']);
  const n = Number(behind.out || 0);

  console.log('\n完成：生成物已恢复，提交里只会剩代码改动。');
  if (n > 0) {
    console.log('本地落后远端 ' + n + ' 个提交，接着执行：git pull --rebase（此时不会冲突）');
  } else {
    console.log('可以直接 git add / commit / push。');
  }
}

main();
