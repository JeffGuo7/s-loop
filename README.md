# Snotra

AI 桌面助手 — Tauri 2 桌面应用，后端集成 [Pi Agent SDK](https://github.com/earendil-works/pi-mono) (Node.js 进程) 作为 AI 引擎，支持 500+ 模型、原生工具调用 (bash/read/write/web_search)、MCP 工具系统、Skills 技能系统、定时任务、桌面宠物、Telegram 集成。

## 技术栈

| 类别 | 技术选型 |
|------|----------|
| 桌面框架 | Tauri 2 |
| 前端 | React 19 + TypeScript + Vite |
| 样式 | Tailwind CSS 4 + CSS Variables (深色/浅色) |
| 状态管理 | Zustand + persist 中间件 |
| 图标 | Lucide React |
| AI 引擎 | [pi-coding-agent](https://www.npmjs.com/package/@earendil-works/pi-coding-agent) + [pi-ai](https://www.npmjs.com/package/@earendil-works/pi-ai) |
| AI 服务 | pi-server (Node.js 子进程) |
| Rust 后端 | tauri, tauri-plugin-opener, tauri-plugin-dialog, tauri-plugin-sql |

## 架构

```
Snotra (Tauri 2)
  │
  ├── Rust ──spawn──► pi-server (Node.js)
  │                     │
  │                     ├── createAgentSession() (同 openclaw)
  │                     ├── 原生工具: read/bash/edit/write/grep/find/ls
  │                     ├── 联网搜索: web_search (DuckDuckGo)
  │                     ├── SSE 流式: text/thinking/tool events
  │                     └── Provider 模型列表 API
  │
  ├── React UI ──HTTP/SSE──► pi-server
  │     发送消息、接收流式事件、思考过程、工具调用
  │
  ├── Rust (MCP 管理器) ─── MCP 服务器 (stdio/SSE)
  └── SQLite 数据库 ─────── 会话/消息持久化
```

## 功能

| 功能 | 状态 |
|------|------|
| AI 对话 (流式输出) | ✅ |
| 思考/推理过程显示 | ✅ |
| 原生工具调用 (bash/read/write/edit/grep/find/ls) | ✅ |
| 联网搜索 (web_search) | ✅ |
| 27+ Provider 支持 (Anthropic/OpenAI/DeepSeek/Groq 等) | ✅ |
| 自定义 Provider (任意 baseURL) | ✅ |
| Fetch Models 自动拉取模型列表 | ✅ |
| MCP 服务器管理 | ✅ |
| Skills 管理系统 | ✅ |
| Agent 构建器 (自定义指令/模型/Skills/权限) | ✅ |
| 多会话管理 | ✅ |
| SQLite 持久化存储 | ✅ |
| 定时任务调度 (Cron + AI Agent) | ✅ |
| 桌面宠物 (孵化/拖拽/稀有度/属性/mood) | ✅ |
| Telegram 集成 | ✅ |
| Workspace 文件树 | ✅ |
| 深色/浅色主题 | ✅ |
| 国际化 (中文/English) | ✅ |

## 快速开始

### 前置要求

- Node.js ≥ 18
- Rust ≥ 1.85 (MSVC 工具链)

### 安装

```bash
cd Snotra
npm install
```

### 运行

```bash
# 完整桌面应用 (推荐)
npm run tauri:dev
```

首次启动时 Tauri 会自动：
1. 编译 Rust 后端
2. 启动 `pi-server` (Node.js 进程)
3. 加载 pi-coding-agent 工具
4. 打开聊天窗口

### 构建

```bash
npm run tauri:build
```

## 配置

### API Key 配置

1. 启动应用后点击 Settings → AI Model Providers
2. 选择 Provider (27+ 内置，或选 Custom 自定义)
3. 输入 API Key (baseURL 自动填充)
4. 点击 **Fetch Models** 自动拉取模型列表
5. 选择模型，点击 Save

### 系统内置工具 (无需配置)

| 工具 | 用途 |
|------|------|
| `read` | 读取文件内容 |
| `write` | 写入文件 |
| `edit` | 编辑文件 |
| `bash` | 执行命令 |
| `grep` | 搜索文件内容 |
| `find` | 查找文件 |
| `ls` | 列出目录 |
| `web_search` | 联网搜索 (DuckDuckGo) |

## 项目结构

```
Snotra/
├── src/                     # React 前端
│   ├── components/
│   │   ├── chat/            # ChatView, ChatInput, MessageList, MessageItem
│   │   │   ├── parts/       # TextPartView, ReasoningView, ToolPartView
│   │   │   ├── blocks/      # StackBlock
│   │   │   └── shared/      # Markdown, Collapsible, StatusIndicator
│   │   ├── layout/          # Sidebar, TitleBar
│   │   ├── settings/        # SettingsModal (27+ Provider 配置)
│   │   ├── agent-builder/   # Agent 构建器
│   │   ├── mcp/             # MCP 服务器管理 UI
│   │   ├── skills/          # Skills 管理 UI
│   │   ├── companion/       # 桌面宠物
│   │   ├── tasks/           # 定时任务
│   │   ├── telegram/        # Telegram 集成
│   │   ├── workspace/       # 文件树
│   │   └── ui/              # 通用组件
│   ├── stores/              # Zustand 状态管理
│   ├── hooks/               # React hooks
│   ├── utils/               # piClient (HTTP/SSE 连接 pi-server)
│   ├── types/               # TypeScript 类型
│   ├── i18n/                # 国际化 (en/zh)
│   └── styles/              # 全局样式 + Tailwind
│
├── pi-server/               # Node.js AI 服务 (同 openclaw 架构)
│   └── index.mjs            # SSE 服务 + createAgentSession + 原生工具
│
├── src-tauri/               # Rust 后端
│   ├── src/
│   │   ├── lib.rs           # Tauri 入口 + pi-server 进程管理
│   │   ├── pi_server.rs     # 启动 pi-server 子进程
│   │   ├── commands.rs      # 文件操作 + Skill 扫描
│   │   ├── mcp_manager.rs   # MCP 服务器管理
│   │   └── skill_installer.rs
│   └── Cargo.toml
│
└── package.json
```

## 依赖

### 前端主要依赖

| 包 | 用途 |
|---|------|
| `@earendil-works/pi-coding-agent` | Agent 会话管理 (服务端) |
| `@earendil-works/pi-ai` | 统一 Provider API + 模型注册表 |
| `@earendil-works/pi-agent-core` | Agent 运行时 |
| `zustand` | 状态管理 |
| `framer-motion` | 动画引擎 |
| `@heroui/react` | UI 组件库 |
| `shiki` | 代码高亮 |
| `lucide-react` | 图标库 |
| `react-virtuoso` | 虚拟列表 |

### Rust 依赖

| 包 | 用途 |
|---|------|
| `tauri` | 桌面应用框架 |
| `tauri-plugin-opener` | 打开外部链接 |
| `tauri-plugin-dialog` | 原生文件对话框 |
| `tauri-plugin-sql` | SQLite 数据库 |
| `serde` / `serde_json` | 序列化 |
| `zip` | ZIP 解压 (Skill 安装) |

## License

MIT
