# Snotra

AI 桌面助手 — Tauri 2 桌面应用，集成 [Pi Agent SDK](https://github.com/earendil-works/pi-mono) 作为 AI 引擎，支持 500+ 模型、MCP 工具系统、Skills 技能系统、定时任务、桌面宠物、Telegram 集成。

## 技术栈

| 类别 | 技术选型 |
|------|----------|
| 桌面框架 | Tauri 2 |
| 前端 | React 19 + TypeScript + Vite |
| 样式 | Tailwind CSS 4 + CSS Variables (深色/浅色) |
| 状态管理 | Zustand + persist 中间件 |
| 图标 | Lucide React |
| AI 引擎 | [@earendil-works/pi-agent-core](https://www.npmjs.com/package/@earendil-works/pi-agent-core) + [@earendil-works/pi-ai](https://www.npmjs.com/package/@earendil-works/pi-ai) |
| Rust 后端 | tauri, tauri-plugin-opener, tauri-plugin-dialog, tauri-plugin-sql |

## 架构

```
┌──────────────────────────────────────────────────────────┐
│                    Snotra (Tauri 2)                       │
│                                                          │
│  ┌──────────────────────┐   Pi Agent SDK (浏览器内)      │
│  │    React Frontend     │────────────► 直接 HTTP ──►    │
│  │    Chat / Tasks       │              Anthropic/OpenAI  │
│  │    Settings / Pet     │              DeepSeek/Groq     │
│  └───────────┬──────────┘              + 500 models      │
│              │                                           │
│  ┌───────────▼──────────┐                               │
│  │    Rust Backend       │                               │
│  │    (MCP Manager)      │                               │
│  │    (Skill Scanner)    │                               │
│  │    (SQLite DB)        │                               │
│  └───────────────────────┘                               │
└──────────────────────────────────────────────────────────┘
```

Pi Agent SDK 运行在浏览器进程中，直接调用 LLM API — **不需要外部服务进程**。

## 功能

| 功能 | 状态 |
|------|------|
| AI 对话 (流式输出) | ✅ |
| 富消息类型 (文本/思考/工具调用/步骤) | ✅ |
| 多会话管理 | ✅ |
| 深色/浅色主题 | ✅ |
| Provider 动态配置 (Anthropic/OpenAI/DeepSeek/... 13+) | ✅ |
| Agent 构建器 (自定义指令/模型/Skills/MCP/权限) | ✅ |
| MCP 服务器管理 (新增/启停/状态) | ✅ |
| Skills 管理系统 (启用/禁用/路径发现) | ✅ |
| 定时任务调度 (Cron + AI Agent) | ✅ |
| 桌面宠物 (孵化/拖拽/稀有度/属性/mood) | ✅ |
| Telegram 集成 (配置/连接/消息收发) | ✅ |
| Workspace 文件树 | ✅ |
| 自定义标题栏 (拖拽/双击最大化/窗口控件) | ✅ |
| SQLite 持久化存储 | ✅ |

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
# 只启动前端 (Vite dev)
npm run dev

# 完整桌面应用
npm run tauri:dev
```

### 构建

```bash
npm run tauri:build
```

## 配置

### API Key 配置

1. 启动应用后点击 Settings
2. 选择 Provider (Anthropic / OpenAI / DeepSeek / ...)
3. 输入 API Key
4. 选择模型（Pi SDK 内置模型列表或手动输入）
5. 点击 Save

## 项目结构

```
src/
├── components/
│   ├── chat/           # ChatView, ChatInput, MessageList, MessageItem
│   │   ├── parts/      # TextPartView, ReasoningView, ToolPartView, StepView
│   │   ├── blocks/     # StackBlock 等消息块
│   │   └── shared/     # Markdown, Collapsible, StatusIndicator
│   ├── layout/         # Sidebar, TitleBar
│   ├── companion/      # 桌面宠物 (PetCompanion, PetHatchModal)
│   ├── settings/       # SettingsModal (Provider/MCP/Skills 配置)
│   ├── tasks/          # 定时任务管理
│   ├── telegram/       # Telegram 集成
│   ├── mcp/            # MCP 服务器管理 UI
│   ├── skills/         # Skills 管理 UI
│   ├── agent-builder/  # Agent 构建器 (自定义 Agent)
│   ├── ui/             # 通用组件 (Button, Card, Input)
│   └── workspace/      # 工作区 (FileTree, WorkspacePanel)
├── stores/             # Zustand 状态管理
├── hooks/              # React hooks
├── utils/              # 工具函数 (piClient - Pi Agent 封装)
├── types/              # TypeScript 类型
├── i18n/               # 国际化 (en/zh)
└── styles/             # 全局样式 + Tailwind

src-tauri/              # Rust 后端
├── src/
│   ├── lib.rs          # Tauri 入口 + MCP/Skills 命令注册
│   ├── commands.rs     # 文件操作 + Skill 扫描
│   ├── mcp_manager.rs  # MCP 服务器连接管理
│   └── skill_installer.rs  # Skill ZIP 安装
└── Cargo.toml
```

## 依赖

### 前端主要依赖

| 包 | 用途 |
|---|------|
| `@earendil-works/pi-agent-core` | Pi Agent 运行时 (状态管理、工具执行、事件流) |
| `@earendil-works/pi-ai` | Pi AI 统一多 Provider API (500+ 模型) |
| `react-virtuoso` | 虚拟列表 (大量消息性能优化) |
| `framer-motion` | 动画引擎 |
| `@heroui/react` | UI 组件库 |
| `shiki` | 代码高亮 |
| `lucide-react` | 图标库 |
| `zustand` | 状态管理 |

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
