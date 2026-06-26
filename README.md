# S-Loop (Snotra)

> AI 桌面助手 — Tauri 2 桌面应用，内置 pi-server (Node.js) 作为 AI 引擎，支持 500+ 模型、原生工具调用、MCP 工具系统、Skills 技能系统、定时任务、桌面宠物、平台消息中心、多色主题。

[![CI](https://github.com/JeffGuo7/s-loop/actions/workflows/ci.yml/badge.svg)](https://github.com/JeffGuo7/s-loop/actions/workflows/ci.yml)

## 技术栈

| 类别 | 技术选型 |
|------|----------|
| 桌面框架 | Tauri 2（含系统托盘、自定义标题栏、透明子窗口） |
| 前端 | React 19 + TypeScript + Vite |
| 样式 | Tailwind CSS 4 + CSS 变量（9 套色系 × 深色/浅色） |
| UI 组件库 | HeroUI v3（原 NextUI） |
| 状态管理 | Zustand + persist 中间件 |
| 动效 | Framer Motion |
| 代码高亮 | Shiki |
| 虚拟列表 | react-virtuoso |
| 图标 | Lucide React |
| AI 引擎 | `@earendil-works/pi-agent-core` + `@earendil-works/pi-ai` + `@earendil-works/pi-coding-agent` |
| AI 服务 | pi-server（Tauri 管理的 Node.js 子进程） |
| 数据库 | SQLite（tauri-plugin-sql） |
| 国际化 | i18next + react-i18next（中文 / English） |

## 架构

```
S-Loop (Tauri 2)
  │
  ├── Rust 后端（src-tauri/）
  │   ├── pi_server.rs      ── 启动/管理 pi-server (Node.js 子进程)
  │   ├── mcp_manager.rs    ── MCP 服务器 (stdio/SSE) 生命周期管理
  │   ├── commands.rs       ── 文件列表/读取、SKILL.md 扫描、远程 Skill 搜索
  │   ├── skill_installer.rs ── Skill ZIP 解压安装
  │   ├── skills_cli.rs     ── npx skills CLI 集成（搜索/安装/更新/删除）
  │   └── lib.rs            ── Tauri 入口、系统托盘、命令注册
  │
  ├── pi-server（src-tauri/pi-server/）
  │   ├── index.mjs             ── HTTP + SSE 服务，Agent 会话管理，工具注册
  │   ├── searchProviders.mjs   ── 联网搜索（Bing/Brave/SearXNG/Tavily/Exa）
  │   ├── platform-center.mjs   ── 平台消息中心（Telegram/Email/Webhook/飞书/钉钉/企业微信）
  │   ├── task-scheduler.mjs    ── Cron 定时任务调度引擎
  │   ├── telegram-monitor.mjs  ── Telegram 长轮询消息监听
  │   └── telegram-chat-sync.mjs ── 平台聊天双向同步
  │
  └── React 前端（src/）
      ├── ChatView          ── AI 对话（流式 SSE、推理过程、工具调用展示）
      ├── Sidebar           ── 左侧导航（会话列表/文件树、页面切换）
      ├── SettingsModal     ── 设置（Provider 配置/MCP/Skills/WebSearch/外观/语言）
      ├── WorkspacePanel    ── 右侧 AI Agent 构建器（指令/模型/Skills/MCP/权限）
      ├── FileTree          ── 工作区文件树（拖拽到聊天输入）
      ├── FilePreviewPanel  ── 文件预览（文本/代码/Markdown/图片/PDF/Excel/Docx/Pptx）
      ├── PlatformCenter    ── 平台消息控制台
      ├── PetPage           ── 桌面宠物（孵化/交互/状态/独立窗口）
      ├── TasksPage         ── 定时任务管理
      ├── MCPSettings       ── MCP 服务器配置
      ├── SkillSettings     ── Skills 管理（本地扫描/远程搜索/拖拽安装）
      └── WebSearchSettings ── 搜索引擎配置
```

## 功能总览

### 🤖 AI 对话
- 流式 SSE 输出（文本/推理/工具调用）
- 思考过程实时展示（ReasoningView）
- 工具调用执行日志（ToolPartView）
- 多会话管理
- 消息虚拟列表（react-virtuoso）
- Markdown 渲染 + 代码高亮（Shiki）
- Mermaid / PlantUML / LaTeX / KaTeX 渲染

### 🔧 Agent 构建器
- 自定义 AI Agent（名称、头像、指令、模型）
- 绑定 Skills（本地 + 远程）
- 绑定 MCP 工具和服务
- 配置可访问路径
- 权限控制（ask / allow / deny）
- 自定义斜杠命令（Slash Commands）

### 🛠 MCP 服务器管理
- 支持 stdio 类型 MCP 服务器
- Rust 后端进程管理（启动/停止/状态监控）
- 工具列表自动刷新
- 启用/禁用控制
- 通过 Tauri invoke 直接操作

### 📋 Skills 系统
- 本地 SKILL.md 文件扫描（递归目录）
- 远程 Skill 搜索（ClawHub / SkillHub API）
- Skills CLI 集成（`npx skills` 搜索/安装/更新/删除）
- 拖拽 ZIP 安装
- 启用/禁用控制
- GitHub 镜像支持

### ⏰ 定时任务
- 支持一次性 / 间隔 / Cron 表达式
- 任务绑定 AI Agent + Skills
- 交付方式：聊天会话 / 平台消息 / 静默
- 执行输出历史查看
- 自动重试、任务链（contextFrom）
- 服务端持久化，应用重启后继续运行

### 🌐 平台消息中心
| 平台 | 支持方向 | 说明 |
|------|----------|------|
| Telegram | 发送 + 接收（轮询） | Bot Token + Chat ID，双向聊天同步 |
| Email | 发送 | SMTP（QQ邮箱/163/Gmail 等） |
| Webhook | 发送 | 通用 JSON POST |
| 飞书 | 发送 | Webhook URL + 事件/加密校验 |
| 钉钉 | 发送 | Webhook URL + 加签 |
| 企业微信 | 发送 | Webhook URL |

### 🐾 桌面宠物（Clawd）
- SVG 动画宠物（多状态：idle/thinking/working/sleeping/error...）
- 独立透明窗口（Tauri 子窗口）
- 情绪系统（happy/neutral/sleepy/excited）
- 互动反馈（点击交互）
- 状态自动切换（idle → attention → sleeping）
- 多宠物主题包支持（clawd / cloudling）

### 🔍 联网搜索
| 引擎 | 是否需要配置 |
|------|-------------|
| Bing（默认） | 零配置，国内可用（cn.bing.com） |
| Brave Search | API Key（免费 2000 次/月） |
| SearXNG | 自建实例 URL |
| Tavily | API Key（免费 1000 次/月） |
| Exa Search | API Key（免费 1000 次/月） |

### 🎨 主题系统
- 9 套色系 × 深色/浅色模式
- 色系：陶土色 / 克莱因蓝 / 森林绿 / 樱花粉 / 暗夜紫 / 琥珀金 / 岩板灰 / 海洋青 / 赤霞红
- CSS 变量驱动，实时切换
- 毛玻璃效果 + 微光动画

### 🗄 持久化存储
- SQLite 数据库（会话 + 消息 + 应用设置）
- Zustand persist（UI 状态 + 配置）
- 自动迁移机制

## 快速开始

### 前置要求
- Node.js ≥ 18
- Rust ≥ 1.85（MSVC 工具链）
- npm

### 安装与运行

```bash
cd Snotra
npm install
npm run tauri:dev   # 开发模式（Tauri 桌面应用）
```

首次启动时 Tauri 自动：
1. 编译 Rust 后端
2. 启动 `pi-server`（Node.js 子进程）监听 4096 端口
3. 加载 pi-coding-agent 工具
4. 打开聊天窗口

### 构建

```bash
npm run tauri:build
```

## 项目结构

```
Snotra/
├── src/                          # React 前端
│   ├── components/
│   │   ├── chat/                 # AI 对话
│   │   │   ├── ChatView.tsx      # 主聊天视图
│   │   │   ├── ChatInput.tsx     # 输入框（支持文件拖拽）
│   │   │   ├── MessageList.tsx   # 消息虚拟列表
│   │   │   ├── MessageItem.tsx   # 消息气泡
│   │   │   ├── parts/            # 消息类型渲染
│   │   │   │   ├── TextPartView.tsx
│   │   │   │   ├── ReasoningView.tsx
│   │   │   │   ├── ToolPartView.tsx
│   │   │   │   ├── StepView.tsx
│   │   │   │   └── ThoughtStackView.tsx
│   │   │   ├── blocks/           # 消息块布局
│   │   │   │   ├── StackBlock.tsx
│   │   │   │   └── MainTextBlock.tsx
│   │   │   └── shared/           # 共享组件
│   │   │       ├── Markdown.tsx / MarkdownShadowDOM.tsx
│   │   │       ├── MermaidBlock.tsx / PlantUMLBlock.tsx
│   │   │       ├── CodeEditorBlock.tsx / CodeRunBlock.tsx
│   │   │       ├── SlashCommandMenu.tsx
│   │   │       ├── StreamingIndicator.tsx
│   │   │       ├── CopyButton.tsx / FileChip.tsx
│   │   │       └── shikiWorker.ts
│   │   ├── layout/               # 布局
│   │   │   ├── Sidebar.tsx       # 左侧导航（会话/文件/页面切换）
│   │   │   └── TitleBar.tsx      # 自定义标题栏
│   │   ├── agent-builder/        # Agent 构建器
│   │   │   ├── AgentBuilder.tsx
│   │   │   ├── AgentSwitcher.tsx
│   │   │   ├── AssemblyArea.tsx
│   │   │   ├── ComponentLibrary.tsx
│   │   │   ├── AgentAssemblyPanel.tsx
│   │   │   └── parts/SkillChip.tsx
│   │   ├── settings/             # 设置
│   │   │   └── SettingsModal.tsx # 设置弹窗（多 tab）
│   │   ├── pet/                  # 桌面宠物
│   │   │   ├── PetPage.tsx       # 宠物主页面
│   │   │   └── PetWindow.tsx     # 独立透明宠物窗口
│   │   ├── platforms/            # 平台消息中心
│   │   │   ├── PlatformCenter.tsx
│   │   │   ├── PlatformCard.tsx
│   │   │   └── PlatformMessageLog.tsx
│   │   ├── tasks/                # 定时任务
│   │   │   ├── TasksPage.tsx
│   │   │   ├── TaskList.tsx
│   │   │   └── CreateTaskModal.tsx
│   │   ├── mcp/                  # MCP 服务器管理
│   │   │   └── MCPSettings.tsx
│   │   ├── skills/               # Skills 管理
│   │   │   ├── SkillSettings.tsx
│   │   │   └── SkillDropZone.tsx
│   │   ├── websearch/            # 网络搜索配置
│   │   │   └── WebSearchSettings.tsx
│   │   ├── workspace/            # 工作区
│   │   │   ├── FileTree.tsx      # 文件树（递归目录遍历）
│   │   │   └── WorkspacePanel.tsx # 右侧 Agent 面板
│   │   ├── preview/              # 文件预览
│   │   │   ├── FilePreviewPanel.tsx
│   │   │   ├── TextPreview.tsx / MarkdownPreview.tsx
│   │   │   ├── ImagePreview.tsx / PdfPreview.tsx
│   │   │   ├── ExcelPreview.tsx / DocxPreview.tsx
│   │   │   ├── PptxPreview.tsx / BinaryPreview.tsx
│   │   │   └── ...
│   │   └── ui/                   # 通用 UI 组件
│   │       ├── Button.tsx / Card.tsx / Input.tsx
│   │       └── MagicButton.tsx
│   ├── stores/                   # Zustand 状态管理
│   │   ├── appStore.ts           # 核心状态（会话/消息/Provider/UI）
│   │   ├── agentStore.ts         # Agent 构建器
│   │   ├── petStore.ts           # 宠物状态机
│   │   ├── platformStore.ts      # 平台消息中心
│   │   ├── taskStore.ts          # 定时任务
│   │   ├── mcpStore.ts           # MCP 服务器
│   │   ├── skillStore.ts         # Skills 管理
│   │   ├── websearchStore.ts     # 联网搜索
│   │   └── filePreviewStore.ts   # 文件预览
│   ├── hooks/                    # React Hooks
│   │   ├── useTaskScheduler.ts   # 任务轮询
│   │   └── useTelegramChatSync.ts # 平台聊天同步
│   ├── utils/                    # 工具函数
│   │   ├── piClient.ts           # pi-server HTTP/SSE 客户端
│   │   ├── database.ts           # SQLite 数据库操作
│   │   ├── platformClient.ts     # 平台消息 API 客户端
│   │   ├── petTheme.ts           # 宠物主题/包加载
│   │   └── sessionMeta.ts        # 会话元信息解析
│   ├── types/                    # TypeScript 类型定义
│   │   ├── index.ts              # 核心类型（Message/Part/Session/Provider）
│   │   ├── agent.ts              # Agent 类型
│   │   ├── pet.ts                # 宠物类型（完整状态机）
│   │   ├── platform.ts           # 平台消息类型
│   │   ├── task.ts               # 定时任务类型
│   │   ├── mcp.ts                # MCP 类型
│   │   ├── skill.ts              # Skill 类型
│   │   ├── websearch.ts          # 搜索引擎类型
│   │   └── filePreview.ts        # 文件预览类型
│   ├── i18n/                     # 国际化
│   │   ├── index.ts
│   │   └── locales/
│   │       ├── en.ts             # English (~800 条)
│   │       └── zh.ts             # 中文 (~850 条)
│   ├── styles/
│   │   └── globals.css           # Tailwind + 主题变量 + 全局样式
│   ├── themes.ts                 # 9 套色系定义（亮/暗）
│   ├── App.tsx                   # 应用入口 + 页面路由
│   ├── main.tsx                  # 主渲染入口
│   └── pet-main.tsx              # 宠物窗口独立渲染入口
│
├── src-tauri/                    # Rust 后端
│   ├── src/
│   │   ├── lib.rs                # Tauri 入口、系统托盘、命令注册
│   │   ├── pi_server.rs          # pi-server 子进程管理
│   │   ├── mcp_manager.rs        # MCP 服务器 stdio 进程管理
│   │   ├── commands.rs           # 文件操作、SKILL.md 扫描、远程搜索
│   │   ├── skill_installer.rs    # Skill ZIP 解压安装
│   │   └── skills_cli.rs         # npx skills CLI 集成
│   ├── pi-server/                # Node.js AI 服务
│   │   ├── index.mjs             # 主服务（HTTP + SSE）
│   │   ├── searchProviders.mjs   # 搜索提供商
│   │   ├── platform-center.mjs   # 平台消息中心
│   │   ├── task-scheduler.mjs    # Cron 调度引擎
│   │   ├── telegram-monitor.mjs  # Telegram 监听
│   │   └── telegram-chat-sync.mjs # 聊天同步
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── public/
│   ├── pets/                     # 宠物主题包
│   │   ├── clawd/               # Clawd 宠物（SVG + theme.json）
│   │   └── cloudling/           # Cloudling 宠物
│   ├── s-loop-icon.png
│   └── s-loop.png
│
├── pet.html                      # 宠物窗口 HTML 入口
├── index.html                    # 主窗口 HTML 入口
├── vite.config.ts                # Vite 配置（多入口）
├── tsconfig.json
├── UI_UX_GUIDELINES.md
└── package.json
```

## 依赖

### 前端主要依赖

| 包 | 用途 |
|---|------|
| `@earendil-works/pi-agent-core` | Agent 运行时 |
| `@earendil-works/pi-ai` | 统一 Provider API + 模型注册表 |
| `@earendil-works/pi-coding-agent` | 编码工具集 |
| `@heroui/react` | UI 组件库（TextField/Select/ListBox/...） |
| `zustand` | 状态管理 |
| `framer-motion` | 动画引擎 |
| `shiki` | 代码高亮 |
| `lucide-react` | 图标库 |
| `react-virtuoso` | 虚拟列表 |
| `react-markdown` | Markdown 渲染 |
| `react-codemirror` | 代码编辑器 |
| `rehype-*` / `remark-*` | Markdown 插件 |
| `mermaid` / `katex` | 图表 / LaTeX 渲染 |
| `pdfjs-dist` / `mammoth` / `xlsx` | 文件预览 |
| `i18next` / `react-i18next` | 国际化 |
| `codemirror` | 代码编辑器（多语言支持） |

### Rust 依赖

| 包 | 用途 |
|---|------|
| `tauri` | 桌面框架（含 tray-icon） |
| `tauri-plugin-opener` | 打开外部链接 |
| `tauri-plugin-dialog` | 原生文件对话框 |
| `tauri-plugin-sql` | SQLite 数据库 |
| `serde` / `serde_json` | 序列化 |
| `reqwest` + `rustls-tls` | HTTP 客户端（远程 Skill 搜索） |
| `zip` | ZIP 解压 (Skill 安装) |
| `base64` | Base64 编解码 |
| `urlencoding` | URL 编码 |

## 配置

### API Key 配置

1. 启动应用后点击 ⚙️ Settings → AI Providers
2. 选择 Provider（29+ 内置，或选 Custom 自定义）
3. 输入 API Key（baseURL 自动填充）
4. 点击 **Fetch Models** 自动拉取模型列表
5. 选择模型，点击 Save

### 内置 Provider 列表

Anthropic / OpenAI / Google Gemini / DeepSeek / Groq / OpenRouter / Mistral / xAI (Grok) / GitHub Copilot / HuggingFace / Fireworks AI / Together AI / Cerebras / Z AI / Perplexity / MiniMax / Moonshot AI / NVIDIA AI / Hyperbolic / Jina AI / Voyage AI / Kimi (Moonshot) / Ollama (Local) / LM Studio (Local) / Custom Provider

### 系统内置工具（无需配置）

| 工具 | 用途 |
|------|------|
| `read` | 读取文件内容 |
| `write` | 写入文件 |
| `edit` | 编辑文件 |
| `bash` | 执行命令 |
| `grep` | 搜索文件内容 |
| `find` | 查找文件 |
| `ls` | 列出目录 |
| `web_search` | 联网搜索（5 引擎可选） |

## License

MIT
