/**
 * GithubTrending · 演示数据（UMD 双用）
 * - 小程序：require('../../data/mock.js')
 * - 浏览器：<script src=".../mock.js"> → window.GHTrendMock
 *
 * 说明：真实环境由云函数 getTrending 抓取 github.com/trending 并提供，
 * 此文件只用于「无 appid / 无云环境」时的本地演示与 UI 联调。
 * 中文「用途」字段为人工撰写，可直接作为真实数据的兜底文案。
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GHTrendMock = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------- 稳定伪随机：让每次渲染的趋势曲线一致 ---------- */
  function hashStr(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function lcg(seed) {
    var s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  /** 生成近 N 天累计 star 序列，末值等于当前 stars */
  function makeTrend(stars, seedName, points, monthlyDelta) {
    points = points || 30;
    var rand = lcg(hashStr(seedName));
    var total = monthlyDelta || Math.round(stars * 0.06);
    var out = [];
    var v = stars - total;
    for (var i = 0; i < points - 1; i++) {
      out.push(Math.round(v));
      v += (total / points) * (0.35 + rand() * 1.3);
    }
    out.push(stars);
    // 修正单调递增
    for (var j = 1; j < out.length; j++) if (out[j] < out[j - 1]) out[j] = out[j - 1];
    out[out.length - 1] = stars;
    return out;
  }

  /* ---------- 语言色（取自 GitHub linguist 主色） ---------- */
  var LANG_COLOR = {
    Python: '#3572A5',
    TypeScript: '#3178c6',
    JavaScript: '#f1e05a',
    Go: '#00ADD8',
    Rust: '#dea584',
    Zig: '#ec915c',
    Svelte: '#ff3e00',
    'Jupyter Notebook': '#DA5B0B',
    Markdown: '#083fa1',
    Shell: '#89e051',
    'C++': '#f34b7d',
    Vue: '#41b883',
    Dart: '#00B4AB',
    Java: '#b07219',
    C: '#555555'
  };

  /* ---------- 榜单素材 ----------
   * purpose  : 一句话中文用途（列表页主文案）
   * detail   : 2~3 句中文详述（详情页）
   * tags     : 中文标签
   */
  var RAW = [
    {
      fullName: 'langgenius/dify',
      descEn: 'Production-ready platform for agentic workflow development.',
      purpose: '开源 LLM 应用开发平台，拖拽画布就能搭出 AI 工作流、知识库问答和 Agent。',
      detail:
        '把「提示词、模型、知识库、工具调用」做成可视化节点，连起来就是一个可上线的 AI 应用。内置 RAG 检索、多模型接入（OpenAI/Claude/Qwen/本地模型）、API 与嵌入页面，适合企业快速做内部 AI 助手或对外的客服机器人。可自托管，数据不出内网。',
      tags: ['LLM 应用', 'RAG', '可视化编排', '可自托管'],
      language: 'TypeScript',
      stars: 132480,
      forks: 20860,
      delta: { d: 386, w: 2640, m: 9840 },
      license: 'Apache-2.0'
    },
    {
      fullName: 'ollama/ollama',
      descEn: 'Get up and running with large language models locally.',
      purpose: '一条命令在本机跑 Llama、Qwen、DeepSeek 等大模型，自带模型仓库和兼容 OpenAI 的 API。',
      detail:
        '装完之后 `ollama run qwen3` 就能在本地跑起来，不用配 CUDA、不用写推理代码。对外暴露 /api 与 OpenAI 兼容接口，现有代码改个 base_url 即可切换到本地模型。适合做离线推理、隐私敏感场景、以及不想付 token 费的开发调试。',
      tags: ['本地推理', '大模型', 'OpenAI 兼容', 'CLI'],
      language: 'Go',
      stars: 156320,
      forks: 13240,
      delta: { d: 298, w: 1980, m: 7260 },
      license: 'MIT'
    },
    {
      fullName: 'open-webui/open-webui',
      descEn: 'User-friendly AI Interface (Supports Ollama, OpenAI API, ...)',
      purpose: '给自己搭一个类 ChatGPT 的网页界面，后端接本地 Ollama 或任意云端大模型。',
      detail:
        '部署一个容器就得到完整的多用户 AI 聊天站：会话历史、模型切换、知识库上传（RAG）、联网搜索、语音输入、图片理解都能开。支持 RBAC 权限，团队内部署后每人一个账号。是「自建 ChatGPT」最省事的方案。',
      tags: ['Web UI', '自托管', '多用户', 'RAG'],
      language: 'Svelte',
      stars: 112860,
      forks: 15640,
      delta: { d: 264, w: 1720, m: 6180 },
      license: 'MIT'
    },
    {
      fullName: 'anthropics/claude-code',
      descEn: 'Claude Code is an agentic coding tool that lives in your terminal.',
      purpose: '终端里的 AI 编程搭档，读懂整个仓库后直接改代码、跑测试、提交 PR。',
      detail:
        '在项目目录里启动，它会自己索引代码结构，你描述需求它就去改文件、执行命令、看报错再修。支持 hooks、子 Agent、MCP 扩展，可以把「写代码 → 跑测试 → 修到过」整条链路交给它。适合重构、补测试、跨文件改动这类人肉很累的活。',
      tags: ['AI 编程', 'Agent', 'CLI', 'MCP'],
      language: 'TypeScript',
      stars: 46820,
      forks: 5240,
      delta: { d: 512, w: 3280, m: 11240 },
      license: 'MIT'
    },
    {
      fullName: 'deepseek-ai/DeepSeek-R1',
      descEn: 'DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning.',
      purpose: '开源推理大模型，用强化学习训练出长链思考能力，数学与代码推理对标闭源旗舰。',
      detail:
        '论文 + 模型权重 + 推理代码全开源。核心是用 RL 让模型自发学会「先想再答」，在 AIME、Codeforces 等推理基准上接近顶级闭源模型。仓库里包含 1.5B 到 671B 多个蒸馏版本，小模型也能在消费级显卡上跑出不错的推理效果。',
      tags: ['推理模型', '强化学习', '开源权重', '论文复现'],
      language: 'Python',
      stars: 94260,
      forks: 12840,
      delta: { d: 342, w: 2260, m: 8460 },
      license: 'MIT'
    },
    {
      fullName: 'microsoft/markitdown',
      descEn: 'Python tool for converting files and office documents to Markdown.',
      purpose: '把 PDF、Word、PPT、Excel、图片统一转成 Markdown，喂给大模型前先洗数据。',
      detail:
        'LLM 最爱吃 Markdown，但你的资料是 docx/xlsx/pdf。这个库一行调用就能转，保留标题层级、表格、列表，OCR 也能处理扫描件。常被当作 RAG 流水线的第一道工序，也适合批量把公司文档转成可检索的知识库。',
      tags: ['文档转换', '数据预处理', 'RAG', 'Python 库'],
      language: 'Python',
      stars: 78420,
      forks: 6420,
      delta: { d: 428, w: 2860, m: 9720 },
      license: 'MIT'
    },
    {
      fullName: 'browser-use/browser-use',
      descEn: 'Make websites accessible for AI agents.',
      purpose: '让 AI 直接操作浏览器：点按钮、填表单、翻页抓数据，网页自动化的通用解法。',
      detail:
        '把网页 DOM 转成模型能理解的元素树，Agent 自己决定点哪里、输入什么，失败还能看截图重试。适合「没有 API 的老网站」自动化：批量下单、后台数据导出、跨系统录入。支持接本地 Chrome，登录态和插件都能复用。',
      tags: ['浏览器自动化', 'Agent', 'RPA', '爬虫'],
      language: 'Python',
      stars: 72640,
      forks: 8640,
      delta: { d: 372, w: 2480, m: 8120 },
      license: 'MIT'
    },
    {
      fullName: 'n8n-io/n8n',
      descEn: 'Fair-code workflow automation platform with native AI capabilities.',
      purpose: '开源自托管的自动化工作流引擎，把几百种服务串起来，还内置 AI 节点。',
      detail:
        'Zapier 的开源替代：可视化连线配置触发器和动作，支持 HTTP 请求、数据库、IM、邮件等 400+ 集成。自带 AI Agent 节点和向量库节点，可以搭「收到邮件 → 模型总结 → 写入表格 → 发通知」这类链路。代码可导出，能自托管，不被 SaaS 按次收费卡住。',
      tags: ['工作流', '自动化', '自托管', 'AI 节点'],
      language: 'TypeScript',
      stars: 148260,
      forks: 46280,
      delta: { d: 246, w: 1640, m: 5940 },
      license: 'Sustainable Use'
    },
    {
      fullName: 'comfyanonymous/ComfyUI',
      descEn: 'The most powerful and modular diffusion model GUI, api and backend with a graph/nodes interface.',
      purpose: '节点式 AI 绘图工作台，把 Stable Diffusion / Flux 的生图流程拆成可复用的图。',
      detail:
        '不像 WebUI 那样只能填参数，这里每个环节（加载模型、ControlNet、采样器、放大、后期）都是节点，连线即流程。一次搭好的高清修复流程能存成 JSON 反复用、能分享给别人。生态里几千个自定义节点，视频生成、局部重绘、批量出图都能拼出来。',
      tags: ['AI 绘图', '节点编排', '扩散模型', '可扩展'],
      language: 'Python',
      stars: 86420,
      forks: 10240,
      delta: { d: 218, w: 1480, m: 5260 },
      license: 'GPL-3.0'
    },
    {
      fullName: 'infiniflow/ragflow',
      descEn: 'RAGFlow is an open-source RAG engine based on deep document understanding.',
      purpose: '开源 RAG 引擎，靠深度文档解析把 PDF 里的表格、版面读懂，再拿去做精准检索问答。',
      detail:
        '普通 RAG 死在「PDF 解析成一坨乱文本」。它用版面分析还原标题层级和表格结构，切片带上下文，检索时能命中正确段落。支持多种 embedding 与重排模型，可自托管，适合把合同、财报、手册变成能问的知识库。',
      tags: ['RAG', '文档理解', '知识库', '可自托管'],
      language: 'Python',
      stars: 68240,
      forks: 7240,
      delta: { d: 196, w: 1320, m: 4680 },
      license: 'Apache-2.0'
    },
    {
      fullName: 'modelcontextprotocol/servers',
      descEn: 'Model Context Protocol Servers.',
      purpose: 'MCP 官方服务端合集，让 AI 通过统一协议安全地读写文件、查数据库、调外部工具。',
      detail:
        'MCP 是「AI 与外部世界」的标准接口。这个仓库提供官方参考实现：文件系统、Git、数据库、搜索、Slack 等，任何支持 MCP 的客户端（Claude、IDE 插件、Agent 框架）都能直接接入。想给自己项目加工具能力，照这里的写法抄最省事。',
      tags: ['MCP', '协议标准', '工具调用', 'Agent 基建'],
      language: 'TypeScript',
      stars: 58240,
      forks: 4860,
      delta: { d: 356, w: 2380, m: 7640 },
      license: 'MIT'
    },
    {
      fullName: 'unslothai/unsloth',
      descEn: 'Finetune Llama 3, Qwen, Gemma & DeepSeek 2x faster with 70% less memory.',
      purpose: '把大模型微调提速 2 倍、显存省 70%，单张消费级显卡也能微调 7B 模型。',
      detail:
        '核心是手写的 Triton 内核 + 梯度检查点优化，几乎不改用法就能替换掉 transformers 的 Trainer。支持 LoRA/QLoRA、4bit 量化训练，还提供现成的 Colab 笔记本。适合个人开发者拿自己数据调一个垂直领域小模型。',
      tags: ['模型微调', 'LoRA', '显存优化', '训练加速'],
      language: 'Python',
      stars: 52640,
      forks: 4260,
      delta: { d: 184, w: 1240, m: 4380 },
      license: 'Apache-2.0'
    },
    {
      fullName: 'hiyouga/LLaMA-Factory',
      descEn: 'Unified Efficient Fine-Tuning of 100+ LLMs & VLMs.',
      purpose: '一站式微调框架，改个 YAML 就能对 100+ 个开源大模型做 SFT、DPO、继续预训练。',
      detail:
        '把「数据格式、模板、并行策略、量化、评测」全部封装好，WebUI 里点几下就能开训。支持 LoRA、全参、RLHF 系列算法，也能调多模态模型。中文文档齐全，是国内微调教程里出现频率最高的一套工具链。',
      tags: ['模型微调', 'SFT/DPO', 'WebUI', '中文文档'],
      language: 'Python',
      stars: 48260,
      forks: 5840,
      delta: { d: 142, w: 960, m: 3280 },
      license: 'Apache-2.0'
    },
    {
      fullName: 'vercel/next.js',
      descEn: 'The React Framework.',
      purpose: 'React 全栈框架，一个项目里同时写前端页面和服务端接口，自带路由与渲染优化。',
      detail:
        'App Router 之后它更像「全栈框架」：Server Components 让数据获取跑在服务端，ISR 做增量静态更新，Server Actions 省掉手写 API。部署到 Vercel 一键上线，也能自托管。做 SEO 敏感的产品站、官网、内容型应用最顺手。',
      tags: ['React', '全栈框架', 'SSR', '前端基建'],
      language: 'TypeScript',
      stars: 136840,
      forks: 29420,
      delta: { d: 96, w: 680, m: 2480 },
      license: 'MIT'
    },
    {
      fullName: 'shadcn-ui/ui',
      descEn: 'Beautifully designed components that you can copy and paste into your apps.',
      purpose: '不是组件库而是「源码分发」的 UI 方案：把代码复制进项目，样式随便改，不被依赖绑住。',
      detail:
        '基于 Radix + Tailwind，提供 50+ 个打磨过的组件（表格、命令面板、日期选择、图表）。关键区别是它把组件源码写进你的仓库，你能改任何一行，也不用担心大版本升级破坏样式。现在是 React 生态里最流行的后台 UI 起手式。',
      tags: ['UI 组件', 'Tailwind', '源码分发', 'React'],
      language: 'TypeScript',
      stars: 96420,
      forks: 6840,
      delta: { d: 128, w: 880, m: 3120 },
      license: 'MIT'
    },
    {
      fullName: 'astral-sh/uv',
      descEn: 'An extremely fast Python package and project manager, written in Rust.',
      purpose: 'Rust 写的 Python 包管理器，装依赖比 pip 快 10~100 倍，还能顺手管虚拟环境和 Python 版本。',
      detail:
        '一条 `uv sync` 就完成「解析依赖 + 建虚拟环境 + 安装」，lock 文件保证可复现。全局缓存加硬链接，重复安装几乎零耗时。同时能装和管理多个 Python 版本，CI 里能省掉几分钟构建时间。正在快速取代 pip + virtualenv + pyenv 的组合。',
      tags: ['Python 工具链', 'Rust', '包管理', '性能'],
      language: 'Rust',
      stars: 62840,
      forks: 3240,
      delta: { d: 156, w: 1080, m: 3860 },
      license: 'MIT'
    },
    {
      fullName: 'zed-industries/zed',
      descEn: 'Code at the speed of thought – Zed is a high-performance, multiplayer code editor.',
      purpose: 'Rust 写的高性能代码编辑器，启动和输入几乎零延迟，原生支持多人协作编辑。',
      detail:
        '用 GPU 渲染界面，大文件、长行也不会卡。内置 AI 补全与内联编辑，多人可以像在线文档一样同时编辑同一个文件、共享终端。支持 LSP、Tree-sitter、Vim 模式，正在成为 VS Code 之外性能党的首选。',
      tags: ['编辑器', 'Rust', '协作', 'GPU 渲染'],
      language: 'Rust',
      stars: 68420,
      forks: 5240,
      delta: { d: 132, w: 920, m: 3280 },
      license: 'GPL-3.0'
    },
    {
      fullName: 'rustdesk/rustdesk',
      descEn: 'An open-source remote desktop application designed for self-hosting.',
      purpose: '开源远程桌面，可完全自建中继服务器，替代 TeamViewer / 向日葵且不按设备收费。',
      detail:
        '客户端跨 Win/Mac/Linux/Android/iOS，自建 hbbs/hbbr 服务端后连接不经第三方，延迟和隐私都可控。支持文件传输、剪贴板、多屏。给家人远程修电脑、公司内网跳板机运维都很合适，商用也不用买授权。',
      tags: ['远程桌面', '自建中继', '跨平台', '替代 TeamViewer'],
      language: 'Rust',
      stars: 94260,
      forks: 12840,
      delta: { d: 118, w: 860, m: 2980 },
      license: 'AGPL-3.0'
    },
    {
      fullName: 'excalidraw/excalidraw',
      descEn: 'Virtual whiteboard for sketching hand-drawn like diagrams.',
      purpose: '手绘风在线白板，画架构图、流程图、草图都像在纸上随手画，还能多人实时协作。',
      detail:
        '开源、可自托管，也提供 npm 包嵌到自己产品里。手绘风格让技术图不那么死板，导出 PNG/SVG、支持暗色主题、无限画布。团队画架构草图、产品原型讨论时比 draw.io 更顺手，数据可以只存在自己服务器。',
      tags: ['白板', '架构图', '协作', '可嵌入'],
      language: 'TypeScript',
      stars: 106420,
      forks: 9840,
      delta: { d: 86, w: 620, m: 2260 },
      license: 'MIT'
    },
    {
      fullName: 'public-apis/public-apis',
      descEn: 'A collective list of free APIs.',
      purpose: '免费公开 API 大全，按分类整理上千个可直接调用的接口，找数据源第一站。',
      detail:
        '按动物、金融、天气、地理、AI、开发工具等几十个分类收录免费 API，标注是否需要密钥、是否有速率限制。做 Demo、找练手数据、接第三方能力时先来这里翻，能省掉大量搜索时间。社区持续 PR 维护。',
      tags: ['API 合集', '资源清单', '练手项目'],
      language: 'Markdown',
      stars: 352640,
      forks: 37420,
      delta: { d: 64, w: 480, m: 1720 },
      license: 'MIT'
    },
    {
      fullName: 'codecrafters-io/build-your-own-x',
      descEn: 'Master programming by recreating your favorite technologies from scratch.',
      purpose: '从零手写一遍经典技术：数据库、Docker、Git、Redis、编译器，靠造轮子真正学懂原理。',
      detail:
        '按「你想造什么」组织，每个条目给一系列教程（多语言），带你用几百行代码实现一个能跑的简化版。README 里那句「What I cannot create, I do not understand」是它的纲领。适合想突破「只会调库」阶段的中级开发者。',
      tags: ['学习路线', '造轮子', '计算机基础'],
      language: 'Markdown',
      stars: 342860,
      forks: 31840,
      delta: { d: 58, w: 420, m: 1580 },
      license: 'CC0-1.0'
    },
    {
      fullName: 'supabase/supabase',
      descEn: 'The Postgres development platform.',
      purpose: '开源版 Firebase：一个 Postgres 数据库附带认证、存储、实时订阅和自动生成 API。',
      detail:
        '建表之后自动得到 REST 与 Realtime 接口，前端直接查库不用写后端；内置 Auth（邮箱/OAuth/手机号）、对象存储、边缘函数、向量检索。可自托管也可用云服务，迁移成本低——底层就是标准 Postgres，随时能 `pg_dump` 走人。',
      tags: ['BaaS', 'Postgres', '认证', '实时订阅'],
      language: 'TypeScript',
      stars: 88240,
      forks: 9240,
      delta: { d: 104, w: 760, m: 2740 },
      license: 'Apache-2.0'
    },
    {
      fullName: 'nodejs/node',
      descEn: 'Node.js JavaScript runtime.',
      purpose: '服务端 JavaScript 运行时，让 JS 脱离浏览器跑后端、脚本、CLI 和各种工具链。',
      detail:
        'V8 引擎 + 事件循环 + 非阻塞 I/O，一个进程就能扛住大量并发连接，特别适合网关、BFF、实时通信和命令行工具。npm 生态是它最大的壁垒：几乎任何需求都有现成包。现在也原生支持 ESM、单文件可执行、内置测试运行器。',
      tags: ['运行时', 'JavaScript', '后端', 'npm 生态'],
      language: 'JavaScript',
      stars: 112480,
      forks: 32420,
      delta: { d: 52, w: 380, m: 1420 },
      license: 'MIT'
    },
    {
      fullName: 'ocornut/imgui',
      descEn: 'Dear ImGui: Bloat-free Graphical User interface for C++ with minimal dependencies.',
      purpose: 'C++ 的即时模式 GUI 库，几行代码就能给游戏引擎、调试器、工具加上可交互界面。',
      detail:
        '不依赖系统控件，自己画所有东西，所以跨平台一致、编译进程序即可用。即时模式意味着每帧重建 UI，状态由你的变量直接驱动，不用维护控件树和回调，写工具特别快。游戏引擎编辑器、显卡驱动面板、机器人调试台里到处都是它。',
      tags: ['GUI 库', 'C++', '即时模式', '工具开发'],
      language: 'C++',
      stars: 68420,
      forks: 12480,
      delta: { d: 38, w: 280, m: 1060 },
      license: 'MIT'
    }
  ];

  /* ---------- 组装成前端可直接消费的结构 ---------- */
  function build() {
    return RAW.map(function (r, i) {
      var owner = r.fullName.split('/')[0];
      var repo = r.fullName.split('/')[1];

      // 演示用：伪造「上一次榜单」的名次，让 NEW / ↑N / ↓N 徽章有内容可看
      var noise = (hashStr(r.fullName) % 11) - 5;
      var prev = i + 1 + noise;
      if (prev < 1) prev = 1 + (i % 3);
      var isNewRepo = hashStr(r.fullName + ':new') % 8 === 0;

      return {
        id: r.fullName,
        rank: i + 1,
        prevRank: isNewRepo ? null : prev,
        fullName: r.fullName,
        owner: owner,
        repo: repo,
        url: 'https://github.com/' + r.fullName,
        descEn: r.descEn,
        purpose: r.purpose,
        detail: r.detail,
        tags: r.tags,
        language: r.language,
        languageColor: LANG_COLOR[r.language] || '#8b949e',
        stars: r.stars,
        forks: r.forks,
        delta: r.delta,
        license: r.license,
        initial: (repo[0] || '?').toUpperCase(),
        trend: makeTrend(r.stars, r.fullName, 30, r.delta.m)
      };
    });
  }

  var ALL = build();

  /** 按周期取榜单：daily 全量，weekly 按周增量重排，monthly 按月增量重排 */
  function pick(period) {
    var list = ALL.slice();
    var key = period === 'weekly' ? 'w' : period === 'monthly' ? 'm' : 'd';
    list.sort(function (a, b) {
      return b.delta[key] - a.delta[key];
    });
    return list.map(function (r, i) {
      var o = Object.assign({}, r);
      o.rank = i + 1;
      o.hot = r.delta[key];
      o.isNew = r.prevRank == null;
      o.rankChange = r.prevRank == null ? null : r.prevRank - o.rank;
      return o;
    });
  }

  /* ---------- 语言 slug（筛选值，与云函数返回的 value 保持一致） ---------- */
  var LANG_SLUG = {
    Python: 'python',
    TypeScript: 'typescript',
    JavaScript: 'javascript',
    Go: 'go',
    Rust: 'rust',
    'C++': 'cpp',
    'C#': 'csharp',
    Java: 'java',
    Shell: 'shell',
    Svelte: 'svelte',
    Vue: 'vue',
    'Jupyter Notebook': 'jupyter-notebook',
    Markdown: 'markdown'
  };

  var LANGUAGES = (function () {
    var seen = {};
    var out = [{ name: '全部', value: '', color: '' }];
    ALL.forEach(function (r) {
      if (seen[r.language]) return;
      seen[r.language] = 1;
      // value 用 slug，和云函数返回的语言清单保持同一套标识
      out.push({
        name: r.language,
        value: LANG_SLUG[r.language] || r.language.toLowerCase(),
        color: r.languageColor
      });
    });
    return out;
  })();

  return {
    all: function () {
      return ALL.slice();
    },
    trending: pick,
    languages: LANGUAGES,
    find: function (id) {
      for (var i = 0; i < ALL.length; i++) if (ALL[i].id === id) return ALL[i];
      return null;
    },
    LANG_COLOR: LANG_COLOR
  };
});
