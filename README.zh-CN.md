# S-Loop

> AI 桌面助手 — 集对话、Agent 编排、定时任务、桌面宠物于一体的 Tauri 2 应用

[English](README.md)

<p align="center">
  <img src="/home.png" alt="S-Loop Screenshot" width="800" />
</p>

<p align="center">
  <a href="https://github.com/JeffGuo7/s-loop/actions/workflows/ci.yml"><img src="https://github.com/JeffGuo7/s-loop/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/JeffGuo7/s-loop/blob/master/LICENSE"><img src="https://img.shields.io/github/license/JeffGuo7/s-loop?color=blue" alt="License"></a>
  <a href="https://github.com/JeffGuo7/s-loop/releases"><img src="https://img.shields.io/github/v/release/JeffGuo7/s-loop?include_prereleases&label=release" alt="Release"></a>
  <a href="https://github.com/JeffGuo7/s-loop/stargazers"><img src="https://img.shields.io/github/stars/JeffGuo7/s-loop?style=flat" alt="Stars"></a>
  <a href="https://github.com/JeffGuo7/s-loop/releases/latest"><img src="https://img.shields.io/badge/download-windows%20.exe-blue?logo=windows" alt="Download Windows"></a>
</p>

## 快速开始

### 开发

```bash
git clone https://github.com/JeffGuo7/s-loop.git
cd Snotra
npm install
npm run tauri:dev
```

> 前置要求：Node.js ≥ 18、Rust ≥ 1.85 (MSVC)、npm

### 下载（Windows）

从 [Releases 页面](https://github.com/JeffGuo7/s-loop/releases/latest) 下载最新安装包。

| 格式 | 文件 |
|------|------|
| 安装版（推荐） | `S-Loop_<version>_x64-setup.exe` |
| 绿色版 | `S-Loop_<version>_x64_en-US.msi` |

## 功能概览

| 模块 | 说明 |
|------|------|
| **AI 对话** | 流式 SSE 输出、推理过程展示、工具调用日志、Markdown + 代码高亮、Mermaid / LaTeX 渲染 |
| **Agent 构建器** | 自定义 Agent（指令/模型/Skills/MCP/权限）、斜杠命令、拖拽编排 |
| **MCP 服务器** | stdio 类型 MCP 进程管理，工具列表自动发现，Rust 后端生命周期控制 |
| **Skills 系统** | 本地 SKILL.md 扫描、远程搜索安装（ClawHub）、ZIP 拖拽安装 |
| **定时任务** | Cron / 间隔 / 一次性，绑定 Agent + Skills，交付到聊天或平台 |
| **平台消息中心** | Telegram（双向同步）、Email、Webhook、飞书、钉钉、企微、Slack、Discord、QQ Bot |
| **桌面宠物** | SVG 动画宠物，独立透明窗口，多状态切换，多主题包 |
| **联网搜索** | Bing / Brave / SearXNG / Tavily / Exa，5 引擎可切换 |
| **主题系统** | 9 套色系 × 深色/浅色，毛玻璃效果，CSS 变量驱动实时切换 |

## 技术栈

| 类别 | 技术 |
|------|------|
| 桌面框架 | Tauri 2 |
| 前端 | React 19 + TypeScript + Vite |
| 样式 | Tailwind CSS 4 + HeroUI v3 |
| 状态管理 | Zustand |
| 动效 | Framer Motion |
| 图标 | Lucide React |
| 代码高亮 | Shiki |
| AI 引擎 | `@earendil-works/pi-agent-core` + `pi-ai` + `pi-coding-agent` |
| AI 服务 | pi-server（Node.js 子进程，HTTP + SSE） |
| 数据库 | SQLite（tauri-plugin-sql） |
| 国际化 | i18next（中文 / English） |

## 架构

```
┌─ Tauri 2 ───────────────────────────────────────────────────┐
│                                                               │
│  Rust 后端                    Node.js AI 引擎                 │
│  ┌──────────────────┐        ┌──────────────────────────┐   │
│  │ pi_server.rs     │◄──────►│ pi-server (HTTP + SSE)    │   │
│  │ mcp_manager.rs   │        │   Agent 会话管理           │   │
│  │ commands.rs      │        │   delegate_task / 子智能体  │   │
│  │ skill_installer  │        │   Goal Loop 自主执行       │   │
│  │ skills_cli.rs    │        │   task-scheduler 定时任务   │   │
│  │ system_tray      │        │   platform-center 消息中心  │   │
│  │                  │        │   telegram-monitor 轮询    │   │
│  └──────────────────┘        └──────────────────────────┘   │
│                                                               │
│  React 前端                                                   │
│  ┌───────────────────────────────────────────────────────┐   │
│  │ ChatView │ AgentBuilder │ TasksPage │ PetPage         │   │
│  │ SettingsModal │ FileTree │ WorkspacePanel │ Sidebar   │   │
│  │ MCP │ Skills │ Platforms │ WebSearch │ i18n           │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

## Star History

<a href="https://star-history.com/#JeffGuo7/s-loop&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=JeffGuo7/s-loop&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=JeffGuo7/s-loop&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=JeffGuo7/s-loop&type=Date" width="600" />
  </picture>
</a>

## License

MIT
