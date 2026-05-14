# Snotra

AI 桌面助手 — Tauri 2 桌面应用，集成 [Kilo CLI](https://github.com/Kilo-Org/kilocode) 作为 AI 引擎，支持 500+ 模型、MCP 工具系统、定时任务、桌面宠物。

## 技术栈

| 类别 | 技术选型 |
|------|----------|
| 桌面框架 | Tauri 2 |
| 前端 | React 19 + TypeScript + Vite |
| 样式 | Tailwind CSS 4 + CSS Variables (深色/浅色) |
| 状态管理 | Zustand + persist 中间件 |
| 图标 | Lucide React |
| AI 引擎 | [@kilocode/cli](https://www.npmjs.com/package/@kilocode/cli) |
| Rust 后端 | tauri, tauri-plugin-opener |

## 架构

```
┌──────────────────────────────────────────────────────────┐
│                    Snotra (Tauri 2)                       │
│                                                          │
│  ┌──────────────────────┐       HTTP + SSE               │
│  │    React Frontend     │◄─────────────────────┐        │
│  │    Chat / Tasks       │    @tauri-apps/api   │        │
│  │    Settings / Pet     │                       │        │
│  └───────────┬──────────┘                       │        │
│              │                                   │        │
│  ┌───────────▼──────────┐    npx kilo serve     │        │
│  │    Rust Backend       │──────────────► ┌─────▼─────┐  │
│  │    (kilo.rs)          │               │  Kilo CLI  │  │
│  └───────────────────────┘               │  Agent     │  │
│                                          │  MCP       │  │
│                                          │  500+      │  │
│                                          │  Models    │  │
│                                          └───────────┘  │
└──────────────────────────────────────────────────────────┘
```

## 功能

| 功能 | 状态 |
|------|------|
| AI 对话 (流式输出) | ✅ |
| 富消息类型 (文本/思考/工具调用/步骤) | ✅ |
| 多会话管理 | ✅ |
| 深色/浅色主题 | ✅ |
| Provider 动态配置 (从 Kilo 拉取全部模型) | ✅ |
| MCP 服务器管理 | ✅ UI / 🔄 后端连接 |
| Skills 管理 | ✅ UI / 🔄 自动发现 |
| 定时任务调度 (Cron + AI Agent) | ✅ |
| 桌面宠物 (孵化/拖拽/稀有度/属性/mood) | ✅ |
| Telegram 集成 | ✅ UI / 🔄 真实连接 |
| Kilo 进程托管 (自动启停) | ✅ |

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
# 方式 1：只启动前端 (Vite dev，需要手动启动 Kilo)
npm run dev

# 方式 2：完整桌面应用 (自动启动 Kilo)
npm run tauri:dev
```

首次启动时 Tauri 会自动：
1. 通过 `npx kilo serve --port=4096` 启动 Kilo 服务
2. 等待 Kilo 就绪
3. 前端自动连接

### 构建

```bash
npm run tauri:build
```

## 配置

### 环境变量 (可选)

创建 `.env` 文件：

```env
# 指定 Kilo 工作目录 (默认为用户主目录)
VITE_KILO_PROJECT_DIR=/path/to/your/project

# 指定 npx 路径 (如果不在 PATH 中)
NPX_PATH=C:\path\to\npx.cmd
```

### API Key 配置

1. 启动应用后点击 Settings
2. 刷新 Provider 列表
3. 选择 Provider 并输入 API Key
4. 选择模型
5. 点击 Save

## 项目结构

```
src/
├── components/
│   ├── chat/           # ChatView, MessageList, MessageItem
│   │   ├── parts/      # TextPartView, ReasoningView, ToolPartView, StepView
│   │   └── shared/     # Markdown, Collapsible, StatusIndicator
│   ├── layout/         # Sidebar（侧边栏）
│   ├── companion/      # 桌面宠物
│   ├── settings/       # SettingsModal（Provider/MCP/Skills）
│   ├── tasks/          # 定时任务管理
│   ├── telegram/       # Telegram 集成
│   ├── mcp/            # MCP 服务器 UI
│   └── skills/         # Skills 管理 UI
├── stores/             # Zustand 状态管理
├── hooks/              # React hooks (useAI, useTaskScheduler)
├── utils/              # 工具函数 (kiloClient)
├── types/              # TypeScript 类型
└── styles/             # 全局样式 + Tailwind

src-tauri/              # Rust 后端
├── src/
│   ├── lib.rs          # Tauri commands + Kilo 进程管理
│   └── kilo.rs         # Kilo serve 子进程 spawn/stop
└── Cargo.toml
```

## 依赖

### 前端主要依赖

| 包 | 用途 |
|---|------|
| `@kilocode/cli` | Kilo CLI npm 包 |
| `react-virtuoso` | 虚拟列表 (消息性能优化) |
| `marked` | Markdown 解析 |
| `highlight.js` | 代码高亮 |
| `lucide-react` | 图标库 |

### Rust 依赖

| 包 | 用途 |
|---|------|
| `tauri` | 桌面应用框架 |
| `tauri-plugin-opener` | 打开外部链接 |

## License

MIT
