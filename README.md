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
| AI 引擎 | Kilo CLI (Bun 运行时) |
| Rust 后端 | tauri, tauri-plugin-opener |

## 架构

```
┌──────────────────────────────────────────┐
│              Snotra (Tauri 2)             │
│                                          │
│  ┌──────────────────┐   HTTP + SSE       │
│  │  React Frontend   │◄─────────────────┐ │
│  │  Chat / Tasks     │  @tauri-apps/api  │ │
│  │  Settings / Pet   │                   │ │
│  └────────┬─────────┘                   │ │
│           │                             │ │
│  ┌────────▼─────────┐   spawn/kill      │ │
│  │  Rust Backend     │──────────► kilo  │ │
│  │  (kilo.rs)        │          serve   │ │
│  └──────────────────┘                   │ │
│                                   ┌─────▼──┐
│                                   │ Agent   │
│                                   │ Loop    │
│                                   │ MCP     │
│                                   │ 500+    │
│                                   │ Models  │
│                                   └─────────┘
└──────────────────────────────────────────┘
```

## 功能

| 功能 | 状态 |
|------|------|
| AI 对话 (流式输出) | ✅ |
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

- Node.js ≥ 24
- Rust ≥ 1.85 (MSVC 工具链)
- Bun ≥ 1.3 (Kilo CLI 运行时)
- [Kilo CLI](https://github.com/Kilo-Org/kilocode) 源码放到 `../kilocode-main/`

### 安装

```bash
cd Snotra
npm install
```

### 运行

```bash
# 方式 1：只启动前端 (Vite dev，手动启动 Kilo)
npm run dev

# 方式 2：完整桌面应用 (自动启动 Kilo)
npm run tauri:dev
```

首次启动时 Tauri 会自动：
1. 找到 Bun 并 spawn `kilo serve --port=4096`
2. 等待 Kilo 就绪
3. 前端自动连接

### 构建

```bash
npm run tauri:build
```

## 开发流程

1. 确保 Kilo CLI 源码在 `../kilocode-main/`
2. 确保 `kilocode-main/` 已安装依赖 (`bun install`)
3. 启动 Snotra: `npm run tauri:dev`
4. Snotra 自动启动 Kilo 后台服务
5. 在 Settings 中刷新 Provider 列表，配置 API Key
6. 开始聊天

## 项目结构

```
src/
├── components/
│   ├── chat/           # ChatView（AI 对话）
│   ├── layout/         # Sidebar（侧边栏）
│   ├── companion/      # 桌面宠物
│   ├── settings/       # SettingsModal（Provider/MCP/Skills）
│   ├── tasks/          # 定时任务管理
│   ├── telegram/       # Telegram 集成
│   ├── mcp/            # MCP 服务器 UI
│   └── skills/         # Skills 管理 UI
├── stores/             # Zustand 状态管理
├── hooks/              # React hooks (useKiloSession, useTaskScheduler, useAI)
├── utils/              # 工具函数 (kiloClient, ai, pet)
├── types/              # TypeScript 类型
└── styles/             # 全局样式 + Tailwind

src-tauri/              # Rust 后端
├── src/
│   ├── main.rs         # 入口
│   ├── lib.rs          # Tauri commands + Kilo 进程管理
│   └── kilo.rs         # Kilo serve 子进程 spawn/stop
└── Cargo.toml
```

## License

MIT
