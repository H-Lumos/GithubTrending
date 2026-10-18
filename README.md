# GithubTrending

> 用中文读懂 GitHub 热榜 · **网页版**（零成本静态站）

浏览 GitHub 官方榜单（今日 / 本周 / 本月），每个项目给出**中文用途说明**并保留**原英文描述**，同时用折线图展示近 30 天的 **star 走势**。

**零服务器、零数据库、零费用**：GitHub Actions 每天抓一次官方榜单 → 提交成静态数据 → GitHub Pages 托管。

## 🔗 线上地址

**<https://h-lumos.github.io/GithubTrending/>**

仓库：<https://github.com/H-Lumos/GithubTrending>

每天北京时间 08:17 自动更新（`.github/workflows/update-trending.yml`）。

| 桌面端列表 | 项目详情（含 30 天走势） | 移动端 |
|---|---|---|
| ![desktop](design/shots/web-desktop.png) | ![detail](design/shots/web-detail.png) | ![mobile](design/shots/web-mobile.png) |

---

## 1. 三种跑法

### 1.1 直接双击打开（最快）

```
双击 web/index.html
```

不需要装任何东西、不需要联网。数据来自 `web/data/trending.js`（离线打包的快照），所以 `file://` 也能跑。

### 1.2 本地起个静态服务（推荐调试用）

```powershell
cd <项目根目录>
python -m http.server 8899
# 打开 http://127.0.0.1:8899/web/
```

### 1.3 部署到 GitHub Pages（免费、可分享）

1. 把仓库推到 GitHub
2. 仓库 **Settings → Pages → Source** 选 **GitHub Actions**
3. 推一次代码（或手动跑一次 `.github/workflows/update-trending.yml`）

之后每天自动抓取 + 自动发布，地址形如 `https://<你的用户名>.github.io/<仓库名>/`。

> Pages 对 **public 仓库免费**；private 仓库用 Pages 需要付费套餐。
> Actions 对 public 仓库不限分钟数，private 仓库每月 2000 分钟（本工作流一次约 30 秒）。

---

## 2. 数据是怎么来的

```
GitHub 官方 Trending 页面（服务端渲染 HTML）
        │  scripts/snapshot.js
        │  解析 <article class="Box-row">：仓库名 / 描述 / 语言色 / ★ / fork / "N stars today"
        ▼
web/data/trending.js   ← { generatedAt, periods:{ daily, weekly, monthly }, languages }
        │  <script> 直接引入（file:// 也能跑，不受 fetch 跨域限制）
        ▼
web/assets/app.js      → 渲染列表 / 详情抽屉 / 30 天走势图
```

三条设计决定，都是为了**不花钱也不掉质量**：

| 决定 | 原因 |
|---|---|
| 抓 trending 页面而不是调 API | GitHub 没有 trending 接口；Search API 未登录只有 60 次/小时，且排序是近似值 |
| 预生成静态数据而不是前端实时抓 | 前端抓 `github.com` 会被 CORS 拦；预生成还不受 API 限流影响 |
| 中文走人工对照表而不是调 LLM | 调模型要付费。见第 4 节，覆盖不到的仓库自动回落英文 |

### 2.1 手动更新

```powershell
$env:SOCKS_PORT='10808'      # 本机需要代理时；能直连 GitHub 就删掉这行
node scripts\snapshot.js
```

同时写两份产物：`web/data/trending.js`（网页用）、`miniprogram/data/snapshot.js`（小程序用）。

### 2.2 历史库：升降徽章 + 真实曲线

data/history.json 每天追加一条记录（d / stars / anks），保留 45 天：

`json
{ "d": "2026-10-18",
  "stars": { "owner/repo": 51314 },
  "ranks": { "daily": ["owner/repo", ...], "weekly": [...], "monthly": [...] } }
`

它支撑两个功能：

| 功能 | 依赖 | 说明 |
|---|---|---|
| **名次徽章** NEW / ↑N / ↓N | 与「上一个有记录的日期」对比 | **首日不会有徽章**，第二天起才会出现 |
| **真实 star 曲线** | 历史上每天记录的 star 数 | 攒满 30 天即全真实；不足时按增量回推，详情页会标注「估算」 |

回推规则（只有一个真实点时）：用该周期的 hot ÷ 周期天数 作为日增，并**按 0.93 衰减**往更早推——否则「今天涨了 2213」会被当成涨了一整月，曲线会先撞 0 再陡升。

### 2.3 自动更新

`.github/workflows/update-trending.yml`：每天 UTC 00:17（北京 08:17）跑一次，有变化才提交，然后自动部署 Pages。也能手动触发（Actions → Run workflow）。

> runner 在 GitHub 自己机房，访问 github.com 最稳，**不需要任何代理**。这也是这套方案比自建服务器可靠的地方。

---

## 附录 · 小程序版（已归档）

主版本已转向网页端。小程序代码仍保留在 `miniprogram/` + `cloudfunctions/`，可继续使用，但不再发展。

归档原因：小程序的 `wx.request` **只能请求已备案域名**，`api.github.com` 永远加不进白名单，所以必须依赖微信云开发或自建备案域名——这两条都要么绑平台、要么等备案。网页端没有这个限制。

以下是原小程序配置，留档备查：

- 微信开发者工具 → 云开发 → 开通，拿到**环境 ID**

### 2.2 配置
```js
// miniprogram/config.js
MODE: 'cloud',
CLOUD_ENV: 'your-env-id',   // 留空则用 DYNAMIC_CURRENT_ENV
```

### 2.3 建两个数据库集合

| 集合 | 用途 | 权限建议 | 索引 |
|---|---|---|---|
| `repo_zh` | 中文用途缓存，`_id = owner__repo` | 所有用户不可读写（仅云函数访问） | 无（用 `_id` 命中） |
| `star_history` | 每日 star 快照，一条 = 一个仓库一天 | 所有用户不可读写 | **复合索引 `id + d`** |
| `rank_snapshots` | 每日名次快照，`_id = period_date`，`ids` 为当天有序榜单 | 所有用户不可读写 | 复合索引 `period + d` |

> 云函数不受集合权限限制，小程序端不直连数据库，所以集合权限一律收紧最安全。

### 2.4 部署两个云函数

在开发者工具里右键 `cloudfunctions/getTrending` → **上传并部署：云端安装依赖**，`syncStars` 同理。

| 云函数 | 作用 | 触发 |
|---|---|---|
| `getTrending` | 榜单 + 详情，含中文补齐、趋势拼装、名次变化对比 | 小程序调用 |
| `syncStars` | 调 `getTrending` 取三周期结果 → 写 star 快照 + 名次快照 → 清理 40 天前旧数据 | 定时器 `0 10 0 * * * *`（每天 00:10） |

> `syncStars` 主动调 `getTrending`（带 `skipZh: true`），保证「榜单口径」只有一个来源，不再自己抓 GitHub。
>
> ⚠️ **部署后务必把 `syncStars` 的超时时间调到 60 秒**（控制台 → 云函数 → 配置）。它并联 3 次 `getTrending`，约需 5–10 秒，默认 3 秒会超时。

### 2.5 环境变量（云函数控制台 → 配置）

| 变量 | 必填 | 说明 |
|---|---|---|
| `GITHUB_TOKEN` | **强烈建议** | 搜索接口限额从 10 次/分 提到 30 次/分，避免 403 |
| `DEEPSEEK_API_KEY` | 可选 | 配了才会自动生成中文用途；不配则用英文原文兜底 |
| `LLM_BASE_URL` | 可选 | 默认 `https://api.deepseek.com/chat/completions`，可换任意 OpenAI 兼容网关 |
| `LLM_MODEL` | 可选 | 默认 `deepseek-chat` |

### 2.6 灌第一批趋势数据
进云函数控制台 → `syncStars` → **测试运行** 一次，当天快照就写进去了。之后定时器每天自动跑。趋势图需要时间累积，前 3 天会用估算曲线过渡（见下文）。

---

## 3. 数据源：双通道（实测结论，别踩坑）

结论先说：**GitHub 的 `/trending` 存在两种渲染变体**，客户端（含云函数）请求有时拿到完整的服务端渲染 HTML，有时只拿到 React 空壳。所以不能只赌一条路。

| 探测 | 结果 |
|---|---|
| `GET /trending?since=daily`（无 cookie） | 200，**36 KB，HTML 里没有 `<article class="Box-row">`**，也没有 `stars today` → React 空壳 |
| 同上（curl UA） | 200，32 KB，同样是空壳 |
| 同上（`Accept: application/json`） | **406** |
| 真实浏览器打开同一页 | **完整渲染**，有语言色点 / `Built by` 头像 / `1,397 stars today` → 经典 SSR 标记存在 |
| GitHub 官方 trending API | **不存在** |
| 第三方镜像（gitterapp / heroku / ossinsight） | 已下线 / 数据 `unavailable since 2026-03-01` |

### 通道 A：官方 trending HTML（优先）

```
GET https://github.com/trending[/语言]?since=daily|weekly|monthly
→ 解析 <article class="Box-row">：
   仓库名 / 描述 / 语言 + 语言色 / star / fork / 「N stars today」/ Built by 头像
```

拿到的是**严格等于官方榜单的顺序**，而且 `hot` 是页面上的真实增量，不用估算。

判据：解析出 **≥ 5 条**才算成功；不足 5 条判定拿到的是 React 空壳，自动转通道 B。

**实测（2026-10-18，真实页面）**：三周期全部命中官方 HTML，但**条数不满**——

| 周期 | 页面实际返回 | `stars today` 出现次数 | 解析结果 |
|---|---|---|---|
| daily | 13 条 | 13 | 13 条，8 项断言全过 |
| weekly | 10 条 | 10 | 10 条，全过 |
| monthly | 21 条 | 21 | 21 条，全过 |

结论：**GitHub 对无登录请求会给一个更短的列表**（不是解析漏，`<article>` 总数就那么多）。所以增加一条补齐策略：

```
默认**不补齐**：官方给多少条就显示多少条，保证与网页逐条一致。想让列表更长（比如凑 25 条）时，把云函数环境变量 `OFFICIAL_TOPUP` 设为 `1`，才会走下面的补齐逻辑：
补进来的排在尾部并各自标记 dataSource
→ 顶层 dataSource 变成 'official+search'，列表页底部会如实显示「官方榜单 + 搜索补充」
```


### 通道 B：官方 Search API（兜底）

```
daily   → created:>=10天前  stars:>=20   → 1816 个候选
weekly  → created:>=30天前  stars:>=60   → 3702 个候选
monthly → created:>=90天前  stars:>=150  → 4312 个候选
```

排序不吃 star 总量，算**涨星速度**：

```
每天涨星   perDay = stars ÷ 仓库年龄(天)
本周期新增 hot    = perDay × 周期天数   （不超过 stars）
```

「三天涨 3000 star 的新库」才会排在「五年攒 5 万 star 的老库」前面。不足 12 条时补一轮 `stars:>=20000 pushed:>=7天前`。

### 怎么知道当前用的是哪条

- 云函数返回里带 `dataSource: 'official' | 'search' | 'api'`
- **小程序列表页底部直接显示「数据源：官方 Trending 榜单 / GitHub 搜索近似」**
- 也可以强制模式：`getTrending` 传 `source: 'official' | 'search'`（`auto` 为默认）

### 一句话取舍

官方通道优先，拿不到才降级——**不会因为 GitHub 改渲染方式就整页空掉**，但降级时顺序是近似值，界面上会明说。
---

## 4. 中文用途怎么来

### 4.1 网页版：人工对照表（零成本）

`data/zh.js` 是一份 `owner/repo → { purpose, detail }` 的对照表，随仓库一起提交。

```
生成快照时：
  data/zh.js 里有这个仓库  → 用人工中文
  没有                     → 回落 GitHub 官方英文描述（前端自动去掉重复的 EN 行）
```

目前覆盖榜单上的 **37 个仓库全部有中文**。榜单以后出现新项目时会自动回落英文，往 `data/zh.js` 补一条再重跑 `node scripts/snapshot.js` 即可。

这样做的取舍：**不用付 API 费用，也不用纠结模型胡说**，代价是新项目首次出现时可能只有英文。

### 4.2 小程序版遗留：三层供给（已归档）

| 层级 | 来源 | 说明 |
|---|---|---|
| 1 | 内置人工整理 | `miniprogram/data/mock.js` 里 24 个项目的 `purpose` / `detail` / `tags`，可直接当种子文案 |
| 2 | 云函数 + 模型生成 | 配 `DEEPSEEK_API_KEY` 后，对缺失项生成 `{purpose, detail, tags}`，写入 `repo_zh` 缓存，**同一仓库永不重复生成** |
| 3 | 兜底 | 原英文描述 + GitHub topics |

无论哪层，**列表页和详情页都会同时展示中文用途 + 原英文描述**：

- 列表卡片：中文一句话（2 行截断）→ 下方 `EN` 前缀的英文原文（1 行）
- 详情页：「这个项目是做什么的」中文段落 → `ORIGINAL DESCRIPTION · 原文` 引用块

### 缓存策略（两个已填的坑）

**① 文案冻结 → 已加过期重生成**

`repo_zh` 每条都带 `updatedAt`。读缓存时判断：

```
未过期（默认 60 天）  → 直接复用
已过期                → 先用旧文案兜底显示（不会突然变回英文），同时排队重新生成并覆盖
```

过期天数用环境变量 `ZH_TTL_DAYS` 调（默认 60）。

**② 首批文案质量 → 已加种子导入云函数 `seedZh`**

`miniprogram/data/mock.js` 里那 24 条**人工撰写**的中文文案可以直接灌进云端当种子，让热门项目首次出现就是人工质量，不必等模型生成：

```powershell
# 1) 本地生成种子文件
node scripts\build-seeds.js          # 产出 cloudfunctions\seedZh\seeds.json（24 条）

# 2) 上传部署 seedZh（右键 → 上传并部署：云端安装依赖）

# 3) 云开发控制台 → 云函数 → seedZh → 测试运行
#    事件 {}               → 只写不存在的条目（幂等，重复跑安全）
#    事件 {"force": true}  → 覆盖已有文案（比如想用人工文案替换模型生成的）
```

返回 `{ok, total, written, skipped, failed, sample}`，失败的条目会带原因。

---

## 5. Star 趋势与榜单位置变化

**趋势图**
1. `syncStars` 每天把三个周期的项目去重合并，写一条 `{id, d, stars}` 快照
2. `getTrending` 读近 30 天快照 → 详情页 canvas 2d 画折线 + 面积渐变
3. 快照不足 3 天（刚部署）时，用本周期增量倒推一条曲线，并打 `trendEstimated: true` 标记，**不假装是真数据**
4. 列表卡片右侧的迷你柱状图用的是同一份 `trend` 尾部 14 个点

**位置变化（新上榜 / ↑N / ↓N）**
1. `syncStars` 额外写一条 `rank_snapshots`：当天该周期的有序 `ids` 数组
2. `getTrending` 取**早于今天最近的一条**快照，用 `computeRankDiff()` 算：`rankChange = 上次名次 − 当前名次`（正数=上升）
3. 上次不在榜 → `isNew: true`，卡片显示绿色 `NEW`
4. 语言筛选下不显示（对比的是全量榜，筛选后名次没有可比性）
5. **没有任何历史快照时一律不标记**，避免首次打开满屏 `NEW`

---

## 6. 目录结构

```
GithubTrending/
├── miniprogram/
│   ├── app.js / app.json / app.wxss     全局：主题 token、安全区、云开发初始化
│   ├── config.js                        运行模式与周期配置（唯一需要你改的文件）
│   ├── data/mock.js                    演示数据 + 24 条中文用途（UMD，浏览器也能直接跑）
│   ├── data/snapshot.js                官方榜单快照（scripts/snapshot.js 生成，勿手改）
│   ├── utils/
│   │   ├── api.js                      snapshot / cloud / http / mock 四态统一数据层 + 内存缓存
│   │   ├── fav.js                      收藏（存整条快照，收藏页可离线秒开）
│   │   └── format.js                   数字/日期/渐变/迷你柱计算
│   ├── components/
│   │   ├── repo-card/                  榜单卡片（排名、缩略图、中英双描述、NEW/↑↓徽章、迷你趋势）
│   │   ├── segment/                    今日/本周/本月切换（滑块动画）
│   │   ├── lang-chips/                 语言筛选（横向滚动）
│   │   └── skeleton/                   骨架屏（微光动画）
│   └── pages/
│       ├── trending/                   榜单页：下拉刷新、筛选、空态、错误态
│       ├── detail/                     详情页：canvas 趋势图、中文用途、原文、位置变化、收藏
│       ├── favorites/                  收藏页：本地快照列表、单条移除、清空
│       └── about/                      关于：主题切换、数据源说明、清空收藏
├── web/                                ← 网页版（主版本）
│   ├── index.html                      页面骨架
│   ├── assets/app.css                  设计系统 + 响应式
│   ├── assets/app.js                   渲染 / 筛选 / 收藏 / 走势图（无依赖）
│   └── data/trending.js                数据（脚本生成，勿手改）
├── data/
│   ├── zh.js                           人工中文对照表（owner/repo → 中文用途）
│   └── history.json                    每日历史（名次 + star），保留 45 天
├── .github/workflows/
│   └── update-trending.yml             每日抓取 + 部署 Pages
├── cloudfunctions/'
)

$c = $c.Replace(
'| 2026-10-18 | 修：内存缓存 key 未带 MODE，切数据源后会拿旧 mock 数据冒充快照 |',
@'
| 2026-10-18 | 修：内存缓存 key 未带 MODE，切数据源后会拿旧 mock 数据冒充快照 |
| 2026-10-18 | **方向调整：主版本转为网页端**（零成本静态站）。小程序版归档到附录 |
| 2026-10-18 | 新增 `web/`：无依赖、无构建，双击 `index.html` 即可运行；桌面/移动响应式、深浅色、收藏、深链 `?open=owner/repo` |
| 2026-10-18 | 新增 `data/zh.js` 人工中文对照表，覆盖榜单 37 个仓库；缺失时回落英文 |
| 2026-10-18 | 新增 `.github/workflows/update-trending.yml`：每日抓取 + 自动部署 Pages，零服务器 |
| 2026-10-18 | 修网页端两个布局 bug：`.grid` 用裸 `1fr` 导致移动端横向溢出；窄屏 meta 行把落星数挤换行 |
| 2026-10-18 | 上线 GitHub Pages：<https://h-lumos.github.io/GithubTrending/> |
| 2026-10-18 | **CI 踩坑**：抓取与部署拆成两个 job 时，`deploy` 检出的是触发时旧提交，新数据不会被部署 → 合并成单 job |
| 2026-10-18 | 安全加固：新增 pre-commit 密钥扫描钩子；`project.config.json`（含 AppID）移出仓库；提交作者邮箱改为 GitHub 匿名地址（含历史重写） |
│   ├── getTrending/                    榜单 + 详情（双通道 + 中文补齐 + 趋势 + 名次变化）
│   ├── syncStars/                      每日 star/名次快照 + 旧数据清理（带定时触发器）
│   └── seedZh/                         把人工中文文案灌进 repo_zh（seeds.json 由脚本生成）
├── scripts/
│   ├── build-seeds.js                  从 mock.js 抽取 24 条人工文案 → seedZh/seeds.json
│   └── snapshot.js                     抓官方榜单生成 miniprogram/data/snapshot.js
├── preview/
│   ├── index.html                      设计稿（5 屏：榜单 / 详情 / 骨架屏 / 空态 / 收藏）
│   └── shot-full.png                   设计稿截图
├── design/icon/                        小程序头像
│   ├── icon-b-bars-144.png             ← 上传用这个
│   ├── icon-b-bars.png                 1024 母版
│   ├── icon-a-arrow*.png               备选方案 A
│   ├── icon-c-star*.png                备选方案 C
│   ├── icon-sheet-v3.png               多尺寸 / 遮罩 / 浅色底对照
│   └── make_icon.py                    生成脚本（Pillow，4× 超采样）
├── design/shots/                       真机自动化截图（automator 产出）
└── .test/                              本地回归脚本（不参与小程序打包）
    ├── socks.js                        测试用 SOCKS5 GET（本机需代理才能到 GitHub）
    ├── run-normalize.js                用真实 Search API 数据验归一化逻辑
    └── node_modules/wx-server-sdk/     wx-server-sdk 测试桩
```

---

## 7. 本地回归（可选，改云函数后跑一下）

这台机器直连 GitHub 会被重置，所以测试脚本走本地 SOCKS5（`127.0.0.1:10808`）。腾讯云上的云函数是直连，不需要代理。

```powershell
$env:NODE_PATH='<项目根目录>\.test\node_modules'
node .test\run-normalize.js daily     # 真实 Search API 数据验归一化，也可 weekly / monthly
node .test\run-rankdiff.js            # computeRankDiff 纯函数单测（不需要网络）
node .test\run-parse-official.js      # 官方 trending HTML 解析单测（用 fixture，不需要网络）

# 端到端：真抓 GitHub + 内存数据库跑完整 getTrending，并逐条比对官方榜单
$env:NODE_PATH=".\.test\node_modules"
$env:SOCKS_PORT='10808'               # 能直连 GitHub 就删掉
node .test\run-cloudfn-e2e.js
```

`run-normalize.js` 校验：字段完整性、`hot` 周期缩放单调性（`daily ≤ weekly ≤ monthly ≤ stars`）、URL 合法性、语言 slug 映射。

实测输出（daily，2026-10-18）：

```
total_count = 1816 | 本页 = 40
#1 wheresryan22/anatomy | JavaScript | ★15461 | 1546/周期
字段完整性: PASS
周期缩放一致(d<=w<=m<=stars): PASS
```

`run-rankdiff.js` 结果（10 项全过）：

```
【无历史快照】全部 isNew=false（避免首屏全 NEW）
【有历史】a/x 不变 0 ｜ b/y ↑1 ｜ c/z ↓1 ｜ d/new 新上榜
结果：10 通过 / 0 失败
```

`run-parse-official.js` 结果（26 项全过，覆盖 HTML 实体解码、语言色提取、star/fork/`stars today`、Built by 头像、残缺块跳过、React 空壳返回空数组）：

```
【正常解析】仓库数 2 ｜ stars 42115 ｜ forks 4492 ｜ stars today 1397 ｜ 头像 2
【异常输入】空 HTML / null / 无 Box-row / 缺 h2 → 均返回 0 条
结果：26 通过 / 0 失败
```

> 说明：官方通道的**线上连通性**这一轮没法验——本机到 github.com 要靠本地代理，而代理中途挂了。解析逻辑本身有 fixture 单测兜住；等代理恢复我会补一次真实页面回归（脚本已备：`.test/probe-cdp-network.js` 可抓页面网络请求，`.test/http-proxy-over-socks.js` 让 Chrome 走 SOCKS 出网）。

### 7.2 真机自动化（DevTools + miniprogram-automator）

这是最硬的一层验证：**真的把小程序跑起来**，点按钮、切周期、进详情、截图、抓 console 与异常。

**前置（只需做一次）**

```
微信开发者工具 → 设置 → 安全设置 → 服务端口 → 打开
```

**跑**

```powershell
cd <项目根目录>

# 1) 让 DevTools 进入自动化模式（--port 用安全设置里显示的服务端口）
& "G:\wechatdev\微信web开发者工具\cli.bat" auto `
    --project "<项目根目录>" `
    --auto-port 9420 --port 51730

# 2) 装一次自动化客户端（已装可跳过）
cd .test; npm install miniprogram-automator --no-save; cd ..

# 3) 跑测试
node .test\run-automator.js
```

**实测结果（2026-10-18，iPhone 12/13 模拟器）**

```
[1] 榜单页      9 项 ✓   24 条数据、header 在视口内、首条中文/英文/趋势齐全
[2] 切到本月    5 项 ✓   周期/文案联动、切完自动回顶
[3] 语言筛选    3 项 ✓   typescript → 8 条且全部同语言
[4] 详情页      8 项 ✓   路由正确、canvas 未降级、轴标签 5 个、区间 +11,240★
[5] 收藏        2 项 ✓   faved 切换 + 收藏页 1 条
[6] 关于页      2 项 ✓   版本号、数据模式文案
────────────────────────────
通过 29 / 29，运行时异常 0 个
```

截图落在 `design/shots/`（01 榜单 / 02 本月 / 03 语言筛选 / 03-detail / 04 收藏 / 05 关于）。

**踩坑记录（写在这里省得下次再撞）**

| 现象 | 原因 | 解法 |
|---|---|---|
| `page.$$('.card')` 返回 0 | `.card` / `.item` / `.chip` 在**自定义组件内部**，page 级选择器穿不过组件边界 | 给组件加 class（`.cmp-card` 等），用 `page.$('.cmp-card')` 拿宿主节点，再用 `element.trigger('opentap', detail)` 派发事件 |
| `element.tap()` 点了没反应 | 同上：tap 打到宿主节点，不触发组件内部 `bindtap` | 用 `trigger(自定义事件名, detail)` 直接触发组件的 `triggerEvent` |
| 测试第二次跑收藏变「取消」 | 收藏存在 storage，跨轮次残留 | 开跑前 `mp.evaluate(() => wx.removeStorageSync(...))` 清干净 |

另有一层**结构自检**（页面/组件路径、`wx:for` 与 `wx:key` 配对、事件绑定函数是否在 js 里存在），本轮结果 `STRUCTURE PASS`。

---

## 8. UI 设计说明

设计语言取 GitHub 原生深色系（`#0b0e14` 底 / `#131820` 卡片 / `#4f9cf9` 强调），中文优先排版：

| 元素 | 处理 |
|---|---|
| 标题 | `Trending` 用蓝→紫→粉渐变文字，弱化品牌感 |
| 排名 | 1–3 名金色渐变数字 + 卡片金色描边，其余为灰阶等宽数字 |
| 缩略图 | 用语言主色生成渐变方块 + 仓库首字母，**不依赖任何外部图片**（国内加载稳定） |
| 中文用途 | 13px 主文案，2 行截断 |
| 英文原文 | `EN` 小标签 + 11.5px 弱化色，1 行省略 |
| 趋势 | 卡片右侧 14 根迷你柱（最近 3 根绿色高亮）；详情页 canvas 折线 + 面积渐变 |
| 主题 | 深色为默认，浅色在 `.theme-light` 下覆盖同一套 CSS 变量，关于页可切换并持久化 |
| 状态 | 骨架屏（微光扫过）、空态（换筛选）、错误态（重试 + 原因文案）都有专门设计 |

---

## 9. 你可能想改的地方

| 想改 | 改哪 |
|---|---|
| 演示数据换成真实项目文案 | `miniprogram/data/mock.js` |
| 榜单条数 | `cloudfunctions/getTrending` 里 `items.slice(0, 25)` |
| 涨星窗口 / 门槛 | 同文件 `PERIOD_META` |
| 语言筛选项 | 同文件 `LANGUAGES` |
| 缓存时效 | `miniprogram/config.js` → `CACHE_TTL` |
| 走自建后端 | `config.js` → `MODE:'http'` + `API_BASE`，接口契约见 `utils/api.js` 顶部注释 |

> 走 `http` 模式时，需要在**小程序后台 → 开发管理 → 服务器域名**配置已备案的 request 合法域名。走云函数没有这个限制。

---

## 10. 已知限制与踩坑记录

**WXML：`wx:if` / `wx:elif` / `wx:else` 之间不能夹注释**

DevTools 会报：

```
Bad attr `wx:else` with message: `wx:if not found, then something must be wrong`
```

原因是注释节点把条件链断掉了。本项目已经踩过并修正（`pages/trending`、`pages/detail` 三处），结构自检脚本里加了一条 lint 专查这个模式。写新页面时把注释放到分支元素**内部**，别放在两个分支中间。

**其它限制**

- 官方通道对无登录请求可能只给 10~21 条 → 已用 Search 补齐，底部会标注「官方榜单 + 搜索补充」
- 无 `GITHUB_TOKEN` 时搜索接口 10 次/分，切周期过快可能 403（前端 5 分钟缓存 + 中文提示已兜）
- 趋势图前 3 天是估算曲线（`trendEstimated` 标记）
- 小程序不能直接打开外部链接，详情页「打开 GitHub」实现为**复制链接**
- 中文生成单次最多 8 条；并发打开同一新仓库会各生成一次（`doc().set()` 幂等，结果一致，只是多花一次调用）
- 本项目**无法在本机直接操作微信开发者工具**：CLI 的服务端口默认关闭，`cli auto` 需要交互式输入 `y` 或手动开启「设置 → 安全设置 → 服务端口」，管道喂 `y` 不生效

---

## 11. 下一步可以加（等你拍板）

1. **按语言榜**做成二级 tab（GitHub 官方有 20+ 语种的独立榜；当前是 chips 筛选）
2. **订阅推送**：定时器 + 订阅消息，每天推「今日 Top5」
3. **榜单变化专题页**：把 `rank_snapshots` 攒起来做「本周上升最快 Top10 / 掉榜榜」
4. **分享卡片图**：用 canvas 生成带二维码的榜单海报
5. **真机适配打磨**：iOS/Android 安全区、刘海、跟随系统暗色模式
6. 成本/合规：上线前需要小程序类目审核（工具类）、隐私协议（收藏存本地，暂不上传）

---

## 安全与隐私

这个仓库是公开的，所以做这几件事：

| 措施 | 说明 |
|---|---|
| **pre-commit 密钥扫描** | `.githooks/`，拦 GitHub 令牌 / `sk-` 密钥 / AWS Key / PEM 私钥 / `password=` 赋值 / Windows 个人目录路径 |
| **本机配置不入库** | `project.config.json`（含小程序 AppID）、`project.private.config.json`、`node_modules/` 都在 `.gitignore` 里 |
| **提交邮箱用匿名地址** | `72478678+H-Lumos@users.noreply.github.com`，不暴露真实邮箱 |
| **纯静态，无后端** | 没有服务器、数据库、登录，也就没有服务端攻击面；访客只能读页面 |

启用钩子（**每个克隆只做一次**，`core.hooksPath` 是本地配置，不会跟着仓库走）：

```powershell
git config core.hooksPath .githooks
```

验证钩子是否生效：

```powershell
# 故意造一个假令牌，提交应该被拦下
echo 'token = "gho_FAKEfakeFAKEfake1234567890abcdef"' > canary.md
git add canary.md && git commit -m test    # 预期：✖ 提交被拦截
git reset HEAD canary.md && del canary.md
```

误报时用 `git commit --no-verify` 跳过（慎用）。

> 密钥真的泄露过？**先 Revoke，再改代码**。历史里的密钥靠删文件是删不掉的。

---
## 12. 变更记录

| 日期 | 内容 |
|---|---|
| 2026-10-18 | v0.1.0 初版：榜单/详情/关于三页、mock 24 项目、云函数双支 |
| 2026-10-18 | 数据源从「爬 trending HTML」改为「Search API + 涨星速度」（页面已前端渲染，爬不到了） |
| 2026-10-18 | 修 `syncStars` 仍爬失效 HTML 的 bug；改为调用 `getTrending`，新增名次快照 |
| 2026-10-18 | 新增「新上榜 / ↑N / ↓N」徽章 + `rank_snapshots` 集合 |
| 2026-10-18 | 新增收藏页（本地快照）、首页收藏入口与角标 |
| 2026-10-18 | 数据源改为**双通道**：官方 trending HTML 优先（严格官方顺序 + 真实 stars today），<5 条自动降级 Search API；响应带 `dataSource`，列表页底部明示来源 |
| 2026-10-18 | 语言清单增加 `slug`（`c++` 要编码成 `c%2B%2B`、`c#` 是 `c%23`），修复官方通道的路径拼装 |
| 2026-10-18 | 官方通道用真实页面实测通过（daily 13 / weekly 10 / monthly 21 条）；新增「官方在前 + Search 补齐」策略与新 dataSource `official+search` |
| 2026-10-18 | 修 DevTools 编译错误：`wx:if/elif/else` 之间夹注释导致 `Bad attr wx:else`（3 处），自检脚本加 lint |
| 2026-10-18 | 填坑①：`repo_zh` 增加 60 天过期重生成（`ZH_TTL_DAYS`，过期先用旧文案兜底） |
| 2026-10-18 | 填坑②：新增 `seedZh` 云函数 + `scripts/build-seeds.js`，把 24 条人工文案灌进缓存当种子 |
| 2026-10-18 | 官方通道线上复测通过（daily 13 / weekly 10 / monthly 21 条），确认第 1 条与 GitHub 页面一致 |
| 2026-10-18 | **真机 bug①**：内部 `scroll-view` 进入时被滚走 198px，header 看不见 → 绑 `scroll-top`，加载/切周期/切语言时强制回顶 |
| 2026-10-18 | **真机 bug②**：自定义导航右侧按钮被微信原生胶囊覆盖 → 用 `wx.getMenuButtonBoundingClientRect()` 算 `capsuleRight`，四个页面统一预留 |
| 2026-10-18 | **真机 bug③**：mock 模式语言筛选永远 0 条（筛选值是 slug、数据里存显示名）→ mock 语言清单改用 slug，`api.js` 做 slug→显示名映射 |
| 2026-10-18 | 接入 miniprogram-automator，真机自动化 34 项断言全过、0 运行时异常，截图存 `design/shots/` |
| 2026-10-18 | **修正**：此前认为「官方应给 25 条」是错的——GitHub 对无登录请求就是给 13/10/21 条。默认改为「官方给多少显示多少」，`OFFICIAL_TOPUP=1` 才补齐 |
| 2026-10-18 | 新增 `snapshot` 模式 + `scripts/snapshot.js`：不依赖云开发也能显示与官方**逐条一致**的榜单 |
| 2026-10-18 | 云函数端到端验证 `run-cloudfn-e2e.js`：真抓 GitHub + 内存数据库，44 条名次全对（13/10/21） |
| 2026-10-18 | 修：快照模式同一句英文显示两遍 → `repo-card` 增加 `showEn`，主文案与英文原文相同时不再重复渲染 |
| 2026-10-18 | 修：内存缓存 key 未带 MODE，切数据源后会拿旧 mock 数据冒充快照 |

---

## License

MIT







