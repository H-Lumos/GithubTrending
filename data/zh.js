/**
 * 人工中文文案表（零成本方案的核心）
 *
 * 为什么不调模型：调 LLM 要花钱。这里改成「人工/AI 辅助整理一份对照表」，
 * 按仓库 id 索引，随仓库一起提交。生成快照时优先用这里的文案，
 * 表里没有的新仓库才回落到 GitHub 官方英文描述。
 *
 * 想补充新条目：往下面对象里加一条即可，然后重跑 node scripts/snapshot.js
 */
module.exports = {
  'anthropics/claude-plugins-official': {
    purpose: 'Claude Code 的官方插件目录，由 Anthropic 亲自维护、筛选过的插件清单。',
    detail:
      '不是社区杂烩，而是官方托管的高质量插件索引。想给 Claude Code 加能力（比如接数据库、接外部工具）时，从这里挑插件比在 GitHub 上乱搜靠谱，版本与兼容性由官方把关。'
  },
  'MadsLorentzen/ai-job-search': {
    purpose: '跑在自己电脑上的 AI 求职助手：筛岗位、改简历、写求职信、准备面试。',
    detail:
      '基于 Claude Code 的求职工作流，全程本地运行，简历和求职数据不上传。它可以按岗位描述评估匹配度、定制 CV、生成求职信、出面试题，fork 下来完全归你自己。'
  },
  'affaan-m/ECC': {
    purpose: '给 AI 编程代理做「驾驭层」优化：技能、直觉、记忆、安全一整套。',
    detail:
      '面向 Claude Code、Codex、Opencode、Cursor 等代理的性能与安全增强层。核心是让代理拥有可复用的技能库、长期记忆和更稳的执行策略，走研究驱动的开发路子。'
  },
  'HKUDS/CLI-Anything': {
    purpose: '把任意软件变成 AI 代理能直接调用的命令行入口（Agent 原生）。',
    detail:
      '目标是「让所有软件都对代理友好」：为软件生成结构化的 CLI 入口，代理就能稳定地操作它，而不是靠模拟点击。配套有 CLI-Hub 做分发。'
  },
  'K-Dense-AI/scientific-agent-skills': {
    purpose: '把 AI 代理变成科研助手：177 个科研技能 + 100 多个科学数据库。',
    detail:
      '覆盖生物、化学、医学、药物发现等方向，兼容 Cursor / Claude Code / Codex 等。装上后代理能查科学数据库、走标准化分析流程，作者称已有 25 万+ 科研人员使用。'
  },
  'akitaonrails/ai-memory': {
    purpose: '给各种 AI 编程 CLI 加长期记忆，方便在不同代理之间交接任务。',
    detail:
      '解决「换个代理就忘光上下文」的问题：把项目记忆持久化下来，Claude Code、Codex 等不同工具可以接力，不用每次重新解释背景。'
  },
  'stablyai/orca': {
    purpose: '一个界面同时驾驭一队 AI 代理，可以用自己的订阅跑任意编程代理。',
    detail:
      '把 Grok Bot、Claude Code 等多个代理放在同一个工作台里管理，桌面端 / 移动端 / 远程运行时都能接，适合需要并行推进多个任务的人。'
  },
  'anthropics/claude-code': {
    purpose: '终端里的 AI 编程搭档，读懂整个仓库后直接改代码、跑测试、提交 PR。',
    detail:
      '在项目目录里启动，它会自己索引代码结构；你用自然语言描述需求，它去改文件、执行命令、看报错再修。支持 hooks、子代理、MCP 扩展，适合重构、补测试、跨文件改造这类体力活。'
  },
  'debpalash/VoiceStudio': {
    purpose: '完全本地运行的开源 ElevenLabs 替代品：克隆音色、配音、转写、做有声书。',
    detail:
      '支持 646 种语言，涵盖音色克隆、音色设计、视频配音、听写、转录与有声书制作。全部在本机跑，音频不出本地，隐私和成本都可控。'
  },
  'anomalyco/opencode': {
    purpose: '开源 AI 编程代理。',
    detail:
      '仓库描述只有一句「the open source coding agent」。定位是与 Claude Code 同类的终端代理，可以接不同模型，适合想自己掌控代理行为、不想被单一厂商绑定的人。'
  },
  'ruvnet/ruflo': {
    purpose: '多代理集群的「驾驭层」：并行调度、自学习记忆、向量 RAG 一体化。',
    detail:
      '让多个 AI 代理协同干活：部署智能体集群、编排自主工作流、搭建对话式 AI 系统，内置自适应记忆、自学习、联邦协作与向量检索，并原生对接 Claude Code / Codex 等。'
  },
  'xerj-org/xerj': {
    purpose: '给 AI 用的代码搜索索引：一条命令索引代码/文档/日志/PDF，比 grep 省 40 倍 token。',
    detail:
      '自动索引项目数据供代理检索，覆盖搜索、RAG、安全审计和代理记忆场景。作者称可替代 ElasticSearch 并省下约 10 倍基础设施成本，适合上下文预算紧张的长任务。'
  },
  'morluto/rea': {
    purpose: '用 AI 代理做逆向工程，从应用行为一路挖到原生二进制。',
    detail:
      '把逆向流程交给代理：先观察应用行为，再逐步深入到二进制层面的分析。适合安全研究、兼容性分析和理解闭源程序的工作流。'
  },
  'storytold/artcraft': {
    purpose: '面向美术、设计与影视创作者的创作引擎。',
    detail:
      '强调「有意图的创作流程」而非一键生成。仓库描述较简短，具体能力建议进仓库看文档与示例。'
  },
  'boykopovar/AnyPS5': {
    purpose: '把 PS5 可执行文件自动移植到 Linux 和 Windows 的工具。',
    detail:
      '面向 PS5 平台的移植工具，自动处理可执行文件的转换与适配，属于主机逆向 / 跨平台移植方向。'
  },
  'cathrynlavery/diagram-design': {
    purpose: '给 AI 代理用的「编辑级」图表设计规范：44 种图表，输出纯 HTML + SVG。',
    detail:
      '兼容 Claude Code、Codex、GitHub Copilot、Cursor 等。产出的是自包含 HTML + SVG（不依赖 Mermaid），刻意不用阴影，追求出版物级别的排版质感。'
  },
  'heygen-com/hyperframes': {
    purpose: '写 HTML，渲染成视频，为 AI 代理而设计。',
    detail:
      '把网页当视频模板：用 HTML/CSS 描述画面，由工具逐帧渲染成视频。适合程序化、批量生成视频内容的场景。'
  },
  'mksglu/context-mode': {
    purpose: '给 AI 编程代理做上下文窗口优化：压缩 98% 工具输出，跨会话保留记忆。',
    detail:
      '把工具的冗长输出先丢进沙箱处理再喂给模型，显著降低 token 占用；同时持久化会话记忆，并通过 MCP + hooks 在 17 个平台上统一路由。'
  },
  'NationalSecurityAgency/ghidra': {
    purpose: '美国国家安全局（NSA）开源的软件逆向工程框架。',
    detail:
      '业界标准的反汇编 / 反编译平台，支持多架构、脚本扩展和多人协作分析。安全研究、恶意样本分析、漏洞挖掘的常用工具。'
  },
  'mattpocock/skills': {
    purpose: '「给真正的工程师」的代理技能集，作者直接从自己的 .agents 目录分享。',
    detail:
      '一组实用主义的 AI 编程技能配置，来自作者日常使用的代理目录，偏工程实践而非演示 Demo，适合直接拿来改造。'
  },
  'ranxianglei/billion-context': {
    purpose: '上下文压缩插件：小窗口也能省 token，还能撑住数月级超长会话。',
    detail:
      '针对 100K 上下文的小窗口做压缩，作者称省 5 倍 token；同时支持数十亿 token 级别的单会话，适合长期跑同一个项目的代理。'
  },
  'cloudflare/security-audit-skill': {
    purpose: 'Cloudflare 出的多阶段安全审计技能，审计结论可机器校验。',
    detail:
      '给编码代理用的安全审计流程：分阶段执行，输出可独立验证、机器可读的审计结论，而不是「看起来没问题」的口头判断。'
  },
  'paperclipai/paperclip': {
    purpose: '用来管理「工作里那些 AI 代理」的开源应用。',
    detail:
      '仓库描述很简短（the open-source app everyone uses to manage agents at work），定位是团队级代理编排与管理，适合多个代理并行时的统一视图。'
  },
  'vectorize-io/hindsight': {
    purpose: '会「学习」的代理记忆系统。',
    detail:
      '给 AI 代理做长期记忆，强调记忆会随使用不断修正和沉淀，而不是单纯的向量检索。适合需要跨会话积累经验的项目。'
  },
  'agent-substrate/substrate': {
    purpose: '代理基础设施的核心系统。',
    detail:
      '仓库描述只有一句「the core system」，属于 Agent 运行时 / 编排底座类项目，具体能力需进仓库看文档。'
  },
  'anthropics/knowledge-work-plugins': {
    purpose: '面向知识工作者的开源插件集，用于 Claude Cowork。',
    detail:
      'Anthropic 官方插件仓库，目标用户是日常做文档、研究、分析的知识工作者，把 Claude 嵌进日常办公流程。'
  },
  'NVIDIA/OpenShell': {
    purpose: '给自主 AI 代理用的安全、私有运行时。',
    detail:
      '英伟达出品，重点在隔离与隐私：让自主代理在受控沙箱里执行动作，避免碰到不该碰的文件与网络，适合把代理放进真实工作环境前的兜底。'
  },
  'tashfeenahmed/freellmapi': {
    purpose: '把 34 家免费 LLM 供应商、635 个模型端点聚合成一个 /v1 接口。',
    detail:
      '统一入口 + 智能路由 + 自动故障转移，密钥加密存储，作者称每月有 74 亿 token 额度，还能接任意 OpenAI 兼容端点。作者注明仅供个人实验使用。'
  },
  'TencentCloud/Octop': {
    purpose: '可自托管的多用户、多代理 AI 助手。',
    detail:
      '腾讯云出的自托管助手，支持多用户与多代理协作，适合在私有环境里搭一套团队级 AI 助理，数据留在自己机器上。'
  },
  'trycua/cua': {
    purpose: '开源「电脑操作」驱动与跨系统沙箱，配套训练和评测基准。',
    detail:
      '让 AI 真正操作电脑：提供跨 macOS / Linux / Windows 的虚拟机沙箱、驱动程序和 benchmark，用于训练、评测与数据生成。'
  },
  'rohitg00/ai-engineering-from-scratch': {
    purpose: '从零学 AI 工程：边学边做，做出来能交付。',
    detail:
      '一套 AI 工程实战教程 / 项目集，强调动手实现与上线，而不是只停留在理论和调 API。'
  },
  'cursor/plugins': {
    purpose: 'Cursor 的插件规范与官方插件。',
    detail:
      '定义了 Cursor 编辑器的插件接口规范，并给出官方示例插件，适合想给 Cursor 写扩展的人。'
  },
  'addyosmani/agent-skills': {
    purpose: '生产级工程技能，给 AI 编程代理用。',
    detail:
      '由 Addy Osmani 整理的代理技能集，聚焦真实工程实践（代码质量、测试、性能），而不是玩具示例。'
  },
  'longbridge/gpui-kit': {
    purpose: '基于 GPUI 的 Rust 跨平台桌面 UI 组件库。',
    detail:
      '用 GPUI 搭桌面应用的组件工具箱，Rust 技术栈，适合想做原生性能、跨平台桌面端的人。'
  },
  'Tencent/WeKnora': {
    purpose: '开源 LLM 知识平台：把原始文档变成可查询的 RAG、推理代理和自维护 Wiki。',
    detail:
      '腾讯开源，覆盖文档解析、检索增强、自主推理与知识库自动维护，适合企业内部知识管理与问答场景。'
  },
  'mlabonne/llm-course': {
    purpose: '大模型入门开源课程：路线图 + Colab 笔记本，边看边跑就能上手。',
    detail:
      '按主题铺好的学习路径：数学与 Transformer 基础、微调、量化、RAG、评估等，每个知识点配可一键运行的 Colab notebook。适合想系统入门 LLM 又不想只看论文的人，仓库 star 已过 8 万。'
  },
  'Kruk2/jasna': {
    purpose: '视频修复与增强工具：修老旧/损坏画面、提清晰度。',
    detail:
      '面向修复类需求（去噪、去划痕、放大提分辨率）。基础功能可用，部分高质量模型需要作者授权的许可证码（README 里注明购买渠道）。'
  },
  'pingdotgg/t3code': {
    purpose: '用手机 App 远程遥控你电脑上跑的 AI 编程代理。',
    detail:
      '作者把它叫「agent harness control surface」：代理仍旧跑在你自己的机器上，手机端（iOS / Android）负责查看进度、下指令、接管会话。适合长时间跑任务时人不在电脑前的情况。仓库本身没有填写描述，信息来自 README。'
  }
};
