/**
 * 生成部署目录 dist/：复制 web/ 并给静态资源注入内容指纹。
 *
 * 为什么单独一步：
 * - GitHub Pages 对静态资源是 Cache-Control: max-age=600，URL 不变就跑缓存
 * - 但「改仓库里的 index.html」会跟本地开发互相冲突（踩过）
 * 所以指纹只在部署副本里注入，仓库里的 index.html 永远保持干净。
 *
 * 用法：node scripts/build-dist.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'web');
const OUT = path.join(ROOT, 'dist');

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function digest(rel) {
  return crypto
    .createHash('sha1')
    .update(fs.readFileSync(path.join(OUT, rel)))
    .digest('hex')
    .slice(0, 8);
}

function main() {
  if (!fs.existsSync(path.join(SRC, 'index.html'))) {
    console.error('✖ 找不到 web/index.html');
    process.exit(1);
  }

  fs.rmSync(OUT, { recursive: true, force: true });
  copyDir(SRC, OUT);

  const jsV = digest('assets/app.js');
  const cssV = digest('assets/app.css');

  // 数据文件也要带指纹：它每次抓取都变，而 Pages 给的是 max-age=600，
  // 不带版本号时新数据可能被浏览器缓存压住 10 分钟（用户会以为「刷新没变化」）。
  const dataV = digest('data/trending.js');

  const idx = path.join(OUT, 'index.html');
  let html = fs.readFileSync(idx, 'utf8');
  const before = html;

  // 先替换已带 ?v= 的，再替换裸引用（幂等，两种情况都能处理）
  html = html
    .replace(/assets\/app\.css(\?v=[0-9a-f]+)?/g, 'assets/app.css?v=' + cssV)
    .replace(/assets\/app\.js(\?v=[0-9a-f]+)?/g, 'assets/app.js?v=' + jsV)
    .replace(/data\/trending\.js(\?v=[0-9a-f]+)?/g, 'data/trending.js?v=' + dataV);

  fs.writeFileSync(idx, html, 'utf8');

  const refs = html.match(/assets\/app\.\w+\?v=[0-9a-f]+/g) || [];
  console.log('部署目录：' + OUT);
  console.log('资源指纹：app.js?v=' + jsV + '  app.css?v=' + cssV + '  data/trending.js?v=' + dataV);
  console.log('index.html 引用：' + refs.join(' , '));

  if (!refs.length) {
    console.error('✖ 指纹注入失败：index.html 里没有找到 assets/app.* 引用');
    process.exit(1);
  }
  if (before === html) {
    console.log('（内容与之前一致）');
  }
}

main();

