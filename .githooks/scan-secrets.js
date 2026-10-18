/**
 * pre-commit 密钥扫描
 * 只检查「本次要提交的新增行」，所以不会因为历史遗留而一直报错。
 *
 * 拦这些：
 *   GitHub 令牌 gho_ / ghp_ / ghu_ / ghs_ / github_pat_
 *   OpenAI 风格 sk-xxx
 *   AWS AKIAxxx
 *   PEM 私钥头
 *   形如 password = "xxx" / token: "xxx" 的赋值
 *   Windows 个人目录 C:\Users\xxx（会泄露用户名）
 *
 * 放行的：文档里的示例（xxxx、<token>、***、your-token 等占位写法）
 */
const { execSync } = require('child_process');

const PLACEHOLDER = /(x{3,}|<[^>]*>|your[-_]?|placeholder|example|dummy|\*\*\*|\.\.\.|redacted)/i;

const RULES = [
  {
    name: 'GitHub 令牌',
    re: /\b(gh[pous]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g
  },
  {
    name: 'OpenAI/DeepSeek 风格密钥',
    re: /\bsk-[A-Za-z0-9_-]{20,}\b/g
  },
  {
    name: 'AWS Access Key',
    re: /\bAKIA[0-9A-Z]{16}\b/g
  },
  {
    name: '私钥文件头',
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g
  },
  {
    name: '疑似密码/密钥赋值',
    re: /\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token)\b\s*[:=]\s*['"][^'"]{8,}['"]/gi
  },
  {
    name: '本机个人目录（泄露 Windows 用户名）',
    re: /[A-Za-z]:[\\/]+Users[\\/]+[A-Za-z0-9._-]+/g
  }
];

/** 这些文件类型不做扫描（二进制/锁定文件） */
const SKIP_EXT = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|zip|pdf|mp4)$/i;

/** 扫描器自身包含规则样例，跳过避免自报 */
const SKIP_FILES = ['.githooks/scan-secrets.js', '.githooks/pre-commit'];

function mask(s) {
  if (s.length <= 10) return s[0] + '***';
  return s.slice(0, 4) + '*'.repeat(Math.min(12, s.length - 6)) + s.slice(-2);
}

function main() {
  let diff = '';
  try {
    diff = execSync('git diff --cached --unified=0 --no-color -- .', {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024
    });
  } catch (e) {
    // 拿不到 diff（比如首次提交前）就直接放行，避免卡住正常工作流
    process.exit(0);
  }

  const findings = [];
  const files = diff.split(/^diff --git /m).slice(1);

  for (const block of files) {
    const fileMatch = block.match(/^a\/(.+?) b\//);
    const file = fileMatch ? fileMatch[1] : '(unknown)';
    if (SKIP_EXT.test(file) || SKIP_FILES.indexOf(file) > -1) continue;

    const lines = block.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.startsWith('+') || line.startsWith('+++')) continue;
      const content = line.slice(1);

      for (const rule of RULES) {
        rule.re.lastIndex = 0;
        let m;
        while ((m = rule.re.exec(content)) !== null) {
          const hit = m[0];
          if (PLACEHOLDER.test(hit)) continue;
          findings.push({ file, rule: rule.name, sample: mask(hit), line: content.trim().slice(0, 100) });
        }
      }
    }
  }

  if (!findings.length) process.exit(0);

  console.error('\n\x1b[31m✖ 提交被拦截：检测到疑似敏感信息\x1b[0m\n');
  const seen = new Set();
  for (const f of findings) {
    const key = f.file + f.rule + f.sample;
    if (seen.has(key)) continue;
    seen.add(key);
    console.error(`  文件：${f.file}`);
    console.error(`  类型：${f.rule}`);
    console.error(`  内容：${f.line}`);
    console.error('');
  }
  console.error('处理办法：');
  console.error('  1) 把密钥换成占位符（<TOKEN> / your-token），或改用环境变量');
  console.error('  2) 真要把密钥提交进私有仓库：git commit --no-verify');
  console.error('  3) 如果不小心已经提交过，立刻去平台 Revoke 该密钥\n');
  process.exit(1);
}

main();

