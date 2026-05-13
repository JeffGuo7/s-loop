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
| AI 集成 | @anthropic-ai/claude-agent-sdk (计划中) |
| 包管理器 | npm (bun 有网络问题) |

## 目录结构

```
src/
├── components/          # UI 组件
│   ├── chat/           # 聊天相关组件
│   ├── layout/         # 布局组件 (Sidebar 等)
│   ├── companion/      # 宠物系统组件
│   │   ├── PetCompanion.tsx   # 桌面宠物显示
│   │   └── PetHatchModal.tsx  # 孵化弹窗
│   ├── settings/       # 设置页面组件
│   └── tasks/          # 定时任务组件
│       ├── TaskList.tsx       # 任务列表
│       ├── CreateTaskModal.tsx # 创建任务弹窗
│       └── TasksPage.tsx      # 任务页面
├── stores/             # Zustand 状态管理
│   ├── appStore.ts     # 应用状态
│   ├── petStore.ts     # 宠物状态
│   └── taskStore.ts    # 任务状态
├── types/              # TypeScript 类型定义
│   ├── index.ts        # 通用类型
│   ├── pet.ts          # 宠物类型
│   └── task.ts         # 任务类型
├── styles/             # 全局样式
├── hooks/              # 自定义 React hooks
│   └── useAI.ts        # AI 对话 hook
└── utils/              # 工具函数
    ├── ai.ts           # AI Provider 实现 (Anthropic/OpenAI)
    └── pet.ts          # 宠物生成逻辑
src-tauri/              # Rust 后端代码
```

## 编码规范

### 命名约定
- 组件文件：PascalCase (如 `ChatView.tsx`)
- 工具函数/hooks：camelCase (如 `useSession.ts`)
- Store 文件：camelCase + Store 后缀 (如 `appStore.ts`)
- 类型文件：统一在 `types/index.ts` 导出

### 样式规范
- 使用 Tailwind CSS 原子类
- CSS 变量定义在 `styles/globals.css`
- 支持深色模式，使用 `.dark` 类切换
- 颜色变量命名：`--color-{name}`

### 状态管理
- 使用 Zustand，配合 persist 中间件持久化
- Store 集中在 `stores/appStore.ts`
- 复杂状态可拆分多个 store

### 组件规范
- 组件使用函数式组件 + hooks
- 每个组件目录包含 `index.ts` 导出
- 保持组件职责单一，便于复用

## 功能模块

### 已完成
- [x] 项目骨架搭建
- [x] 基础布局 (Sidebar + ChatView)
- [x] 会话管理 (创建/删除/切换)
- [x] 主题切换 (深色/浅色)
- [x] Zustand 状态管理 + 持久化
- [x] 设置页面 (Provider 配置、API Key、模型选择)
- [x] AI API 集成 (Anthropic/OpenAI 流式输出)
- [x] 宠物系统 (孵化、稀有度、属性、可拖拽)
- [x] 定时任务 (创建、管理、频率设置)
- [x] Telegram 接入 (配置界面、连接状态、消息发送)
- [x] MCP/Skills 系统 (MCP服务器管理、Skills管理、设置界面集成)

### 进行中
- [ ] 实际 MCP 连接实现 (通过 Tauri 后端)
- [ ] Skills 自动发现 (扫描 SKILL.md 文件)

### 计划中
- [ ] 宠物动画与交互增强
- [ ] 定时任务执行引擎
- [ ] Telegram Bot 完整功能

## 参考项目

位于 `../` 目录：
- `cc-haha-main/` - Tauri 2，功能最全，宠物系统参考
- `opencowork-main/` - Electron，浮球功能参考
- `open-cowork-main/` - Tauri 2，简洁架构参考

## 运行命令

```bash
npm run dev        # 前端开发服务器
npm run tauri dev  # Tauri 完整开发模式
npm run build      # 构建前端
npm run tauri build # 构建桌面应用
```
