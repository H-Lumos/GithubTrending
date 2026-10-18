/**
 * 一键发布到 GitHub Pages（适配本机必须走代理的网络环境）
 *   1) 从 Git Credential Manager 取令牌（不落盘、不写进 .git/config）
 *   2) 创建仓库（已存在则跳过）
 *   3) 推送 main（git 走本地 HTTP 桥 → SOCKS5）
 *   4) 开启 Pages（Source = GitHub Actions）
 *   5) 触发一次抓取工作流并等它跑完
 *   6) 打印最终网址
 *
 * API 调用走 curl --socks5-hostname（Node 自带 fetch 不读系统代理）
 * 用法：node .test/publish.js [owner] [repo]
 */
const { execFileSync } = require('child_process');
const path = require('path');

const OWNER = process.argv[2] || 'H-Lumos';
const REPO = process.argv[3] || 'GithubTrending';
const ROOT = path.join(__dirname, '..');
const SOCKS = '127.0.0.1:10808';

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

function getToken() {
  // 优先用环境变量传入（避免再触发一次登录弹窗）
  if (process.env.GH_TOKEN) return { user: process.env.GH_USER || OWNER, token: process.env.GH_TOKEN };

  const out = execFileSync('git', ['credential', 'fill'], {
    cwd: ROOT,
    encoding: 'utf8',
    input: 'protocol=https\nhost=github.com\n\n'
  });
  const map = {};
  out.split('\n').forEach((line) => {
    const i = line.indexOf('=');
    if (i > 0) map[line.slice(0, i)] = line.slice(i + 1);
  });
  if (!map.password) throw new Error('凭据里没有 password（GitHub 登录还没完成）');
  return { user: map.username || OWNER, token: map.password };
}

function api(token, method, p, body) {
  const args = [
    '-sS',
    '--socks5-hostname', SOCKS,
    '--max-time', '40',
    '-X', method,
    '-H', 'Authorization: Bearer ' + token,
    '-H', 'Accept: application/vnd.github+json',
    '-H', 'X-GitHub-Api-Version: 2022-11-28',
    '-H', 'User-Agent: ght-trending-publish'
  ];
  if (body) args.push('-H', 'Content-Type: application/json', '-d', JSON.stringify(body));
  args.push('-w', '\n__STATUS__%{http_code}', 'https://api.github.com' + p);

  let out = '';
  try {
    out = execFileSync('curl.exe', args, { encoding: 'utf8', timeout: 60000 });
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || '');
  }
  const m = out.match(/__STATUS__(\d+)\s*$/);
  const status = m ? Number(m[1]) : 0;
  const text = out.replace(/\n__STATUS__\d+\s*$/, '').trim();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (e) {}
  return { status, ok: status >= 200 && status < 300, json, text };
}

function scopeHint(status, text) {
  if (status === 403 && /Resource not accessible|scopes/i.test(text)) return '（令牌缺少权限，需要 repo + workflow）';
  if (status === 401) return '（令牌无效或已过期）';
  if (status === 404) return '（找不到，可能是权限不足）';
  return '';
}

(async () => {
  log('== 1. 从凭据管理器取令牌 ==');
  const { token } = getToken();
  log('  已拿到令牌（长度 ' + token.length + '，不落盘）');

  const me = api(token, 'GET', '/user');
  if (!me.ok) throw new Error('令牌校验失败 ' + me.status + ' ' + me.text.slice(0, 150) + scopeHint(me.status, me.text));
  const owner = me.json.login;
  log('  身份：' + owner);

  log('\n== 2. 创建仓库 ' + owner + '/' + REPO + ' ==');
  const create = api(token, 'POST', '/user/repos', {
    name: REPO,
    description: '用中文读懂 GitHub 热榜 · 零成本静态站（Actions 每日抓取 + Pages 托管）',
    homepage: 'https://' + owner + '.github.io/' + REPO + '/',
    private: false,
    has_issues: true,
    has_wiki: false,
    has_projects: false
  });
  if (create.ok) log('  已创建（public）');
  else if (create.status === 422) log('  仓库已存在，跳过');
  else log('  返回 ' + create.status + scopeHint(create.status, create.text) + ' ' + create.text.slice(0, 160));

  log('\n== 3. 推送 main ==');
  try {
    git(['remote', 'set-url', 'origin', 'https://github.com/' + owner + '/' + REPO + '.git']);
  } catch (e) {
    try {
      git(['remote', 'add', 'origin', 'https://github.com/' + owner + '/' + REPO + '.git']);
    } catch (e2) {}
  }
  try {
    git(['push', '-u', 'origin', 'main']);
    log('  推送完成');
  } catch (e) {
    const msg = ((e.stderr || '') + (e.stdout || '')).toString();
    if (/Everything up-to-date/i.test(msg)) log('  已是最新');
    else throw new Error('推送失败：' + msg.slice(0, 400));
  }

  log('\n== 4. 开启 Pages（Source = GitHub Actions）==');
  const pages = api(token, 'POST', '/repos/' + owner + '/' + REPO + '/pages', { build_type: 'workflow' });
  if (pages.ok) log('  已开启');
  else if (pages.status === 409) log('  早已开启，跳过');
  else log('  返回 ' + pages.status + scopeHint(pages.status, pages.text) + ' ' + pages.text.slice(0, 160));

  log('\n== 5. 触发抓取工作流 ==');
  const dispatch = api(token, 'POST', '/repos/' + owner + '/' + REPO + '/actions/workflows/update-trending.yml/dispatches', {
    ref: 'main'
  });
  if (dispatch.status === 204) log('  已触发');
  else log('  触发返回 ' + dispatch.status + scopeHint(dispatch.status, dispatch.text) + ' ' + dispatch.text.slice(0, 160));

  log('\n== 6. 等工作流跑完 ==');
  let run = null;
  for (let i = 0; i < 40; i++) {
    await sleep(6000);
    const runs = api(token, 'GET', '/repos/' + owner + '/' + REPO + '/actions/runs?per_page=1');
    if (!runs.ok) {
      log('  查询失败 ' + runs.status + scopeHint(runs.status, runs.text));
      break;
    }
    run = (runs.json.workflow_runs || [])[0];
    if (!run) {
      log('  [' + (i + 1) + '] 还没有运行记录…');
      continue;
    }
    log('  [' + (i + 1) + '] ' + run.name + ' → ' + run.status + ' / ' + (run.conclusion || '进行中'));
    if (run.status === 'completed') break;
  }
  if (run && run.conclusion) {
    log('\n  结论：' + run.conclusion);
    if (run.conclusion !== 'success') log('  日志：' + run.html_url);
  }

  const info = api(token, 'GET', '/repos/' + owner + '/' + REPO + '/pages');
  const site = (info.ok && info.json && info.json.html_url) || 'https://' + owner + '.github.io/' + REPO + '/';

  log('\n================ 完成 ================');
  log('仓库：https://github.com/' + owner + '/' + REPO);
  log('网址：' + site);
  log('（Pages 首次生效可能要 1~2 分钟）');
})().catch((e) => {
  console.error('\n失败：' + e.message);
  process.exit(1);
});
