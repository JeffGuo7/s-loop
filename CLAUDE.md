# Snotra 项目规则

## 技术栈

| 类别 | 技术选型 |
|------|----------|
| 桌面框架 | Tauri 2 |
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite |
| 样式方案 | Tailwind CSS 4 |
| 状态管理 | Zustand (with persist middleware) |
| 图标库 | Lucide React |
| AI 引擎 | [@earendil-works/pi-agent-core](https://www.npmjs.com/package/@earendil-works/pi-agent-core) + [@earendil-works/pi-ai](https://www.npmjs.com/package/@earendil-works/pi-ai) |
| 包管理器 | npm |

## Pi Agent 集成架构

Pi Agent SDK 运行在浏览器进程中，直接调用 LLM API — **不需要外部服务进程**。

```
Snotra (Tauri + React) ──Pi Agent SDK── HTTP ──► Anthropic / OpenAI / DeepSeek / ...
```

- `src/utils/piClient.ts` — Pi Agent 封装层
  - `prompt(sessionId, content, options)` → `{ text, error? }`：发送消息，返回结果
  - `subscribeStream(sessionId, callbacks)`：订阅流式文本增量
  - `abortSession(sessionId)` / `resetSession(sessionId)`：会话控制
  - `setApiKeyResolver(resolver)`：动态 API Key 解析
  - `listProviders()` / `listProviderModels(provider)`：Provider/模型列表
- `ChatView.tsx` 通过 `Pi.prompt()` 获取最终结果；`Pi.subscribeStream()` 提供实时流式展示

### Pi Agent 关键特性

- **浏览器内运行**：不需要 `npx opencode serve` 等外部进程
- **事件驱动**：`agent.subscribe()` 接收 `message_start` / `message_update` / `message_end` / `agent_end`
- **状态自管理**：`agent.state.messages` 持有完整对话，`agent.state.streamingMessage` 是当前流式片段
- **API Key 动态解析**：`getApiKey` 回调每次请求前从 Zustand store 读取

## 目录结构

```
src/
├── components/
│   ├── chat/           # 聊天系统 (ChatView, ChatInput, MessageList, MessageItem)
│   │   ├── parts/      # 消息类型渲染 (TextPartView, ToolPartView, ReasoningView, StepView)
│   │   ├── blocks/     # 消息块 (StackBlock)
│   │   └── shared/     # 共享组件 (Markdown, Collapsible, StatusIndicator)
│   ├── layout/         # Sidebar, TitleBar
│   ├── companion/      # 宠物系统 (PetCompanion, PetHatchModal)
│   ├── settings/       # 设置页面 (SettingsModal)
│   ├── tasks/          # 定时任务 (TasksPage, TaskList, CreateTaskModal)
│   ├── telegram/       # Telegram 集成
│   ├── mcp/            # MCP 服务器管理
│   ├── skills/         # Skills 管理
│   ├── agent-builder/  # Agent 构建器 (AgentBuilder, AgentSwitcher, AssemblyArea, ComponentLibrary)
│   ├── ui/             # 通用组件 (Button, Card, Input)
│   └── workspace/      # 工作区 (FileTree, WorkspacePanel)
├── stores/             # Zustand 状态管理
│   ├── appStore.ts     # 应用核心 (会话/消息/Provider/UI)
│   ├── agentStore.ts   # Agent 构建器
│   ├── petStore.ts     # 宠物状态
│   ├── taskStore.ts    # 定时任务
│   ├── mcpStore.ts     # MCP 服务器
│   ├── skillStore.ts   # Skills 管理
│   └── telegramStore.ts
├── hooks/              # React hooks (useTaskScheduler)
├── utils/              # 工具函数
│   ├── piClient.ts     # Pi Agent 封装
│   ├── pet.ts          # 宠物生成逻辑
│   ├── database.ts     # SQLite 数据库操作
│   └── index.ts        # 公共导出
├── types/              # TypeScript 类型 (index, pet, task, mcp, skill, telegram, agent)
├── i18n/               # 国际化 (en/zh)
└── styles/             # 全局样式
src-tauri/              # Rust 后端
└── src/
    ├── lib.rs          # Tauri 入口 (MCP + Skills 命令注册)
    ├── commands.rs     # 文件列表/读取 + SKILL.md 扫描
    ├── mcp_manager.rs  # MCP 子进程管理 (stdio/SSE)
    └── skill_installer.rs  # Skill ZIP 安装
```

## 编码规范

- 组件文件：PascalCase (如 `ChatView.tsx`)
- 工具函数/hooks：camelCase (如 `useTaskScheduler.ts`)
- Store 文件：camelCase + Store 后缀 (如 `appStore.ts`)
- 样式：Tailwind CSS 原子类 + CSS 变量
- 状态管理：Zustand + persist 中间件

## 运行命令

```bash
npm run dev        # 前端开发服务器
npm run tauri:dev  # Tauri 完整桌面应用
npm run build      # 构建前端
npm run tauri:build # 构建桌面应用
```

## 工作规则

- `npm run tauri:dev` 启动 Tauri + Vite 开发环境
- Rust 代码位于 `src-tauri/`，编译用 MSVC 工具链 (rustup default stable-msvc)
- Tauri 自动通过 `resolve_project_dir()` 找 Snotra 项目目录
- `npm run tauri:dev` 是阻塞式进程，会打开桌面窗口
