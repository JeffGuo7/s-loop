# S-Loop

> AI Desktop Workbench — chat, agent orchestration, scheduled tasks, desktop pet, all in one Tauri 2 app

<p align="center">
  <img src="/s-loop.png" alt="S-Loop Screenshot" width="800" />
</p>

<p align="center">
  <a href="https://github.com/JeffGuo7/s-loop/actions/workflows/ci.yml"><img src="https://github.com/JeffGuo7/s-loop/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/JeffGuo7/s-loop/blob/master/LICENSE"><img src="https://img.shields.io/github/license/JeffGuo7/s-loop?color=blue" alt="License"></a>
  <a href="https://github.com/JeffGuo7/s-loop/releases"><img src="https://img.shields.io/github/v/release/JeffGuo7/s-loop?include_prereleases&label=release" alt="Release"></a>
  <a href="https://github.com/JeffGuo7/s-loop/stargazers"><img src="https://img.shields.io/github/stars/JeffGuo7/s-loop?style=flat" alt="Stars"></a>
  <a href="https://github.com/JeffGuo7/s-loop/releases/latest"><img src="https://img.shields.io/badge/download-windows%20.exe-blue?logo=windows" alt="Download Windows"></a>
</p>

[中文文档](README.zh-CN.md)

## Quick Start

### Development

```bash
git clone https://github.com/JeffGuo7/s-loop.git
cd Snotra
npm install
npm run tauri:dev
```

> Prerequisites: Node.js ≥ 18, Rust ≥ 1.85 (MSVC), npm

### Download (Windows)

Download the latest installer from the [Releases page](https://github.com/JeffGuo7/s-loop/releases/latest).

| Format | File |
|--------|------|
| Installer (recommended) | `S-Loop_<version>_x64-setup.exe` |
| Portable | `S-Loop_<version>_x64_en-US.msi` |

## Features

| Module | Description |
|--------|-------------|
| **AI Chat** | Streaming SSE output, reasoning visualization, tool call logs, Markdown + syntax highlighting, Mermaid / LaTeX |
| **Agent Builder** | Custom agents (instructions / model / Skills / MCP / permissions), slash commands, drag-and-drop assembly |
| **MCP Servers** | stdio MCP process management, auto tool discovery, Rust-managed lifecycle |
| **Skills** | Local SKILL.md scanning, remote install from ClawHub, CLI integration, ZIP drag-and-drop |
| **Scheduled Tasks** | Cron / interval / one-shot, bind Agent + Skills, deliver to chat or platform |
| **Platform Hub** | Telegram (bidirectional sync), Email, Webhook, Feishu, DingTalk, WeCom, Slack, Discord, QQ Bot |
| **Desktop Pet** | SVG animated pet, transparent overlay window, multi-state, theme packs |
| **Web Search** | Bing / Brave / SearXNG / Tavily / Exa — 5 engines, zero-config default |
| **Themes** | 9 color palettes × dark/light, glassmorphism, CSS variable driven |

## Tech Stack

| Layer | Stack |
|-------|-------|
| Desktop | Tauri 2 |
| Frontend | React 19 + TypeScript + Vite |
| Styling | Tailwind CSS 4 + HeroUI v3 |
| State | Zustand |
| Animation | Framer Motion |
| Icons | Lucide React |
| Syntax | Shiki |
| AI Engine | `@earendil-works/pi-agent-core` + `pi-ai` + `pi-coding-agent` |
| AI Runtime | pi-server (Node.js child process, HTTP + SSE) |
| Database | SQLite (tauri-plugin-sql) |
| i18n | i18next (English / Chinese) |

## Architecture

```
┌─ Tauri 2 ───────────────────────────────────────────────────┐
│                                                               │
│  Rust Backend                  Node.js AI Engine              │
│  ┌──────────────────┐        ┌──────────────────────────┐   │
│  │ pi_server.rs     │◄──────►│ pi-server (HTTP + SSE)    │   │
│  │ mcp_manager.rs   │        │   Agent sessions           │   │
│  │ commands.rs      │        │   delegate_task / subagent │   │
│  │ skill_installer  │        │   Goal Loop executor       │   │
│  │ skills_cli.rs    │        │   task-scheduler (cron)    │   │
│  │ system_tray      │        │   platform-center (hub)    │   │
│  │                  │        │   telegram-monitor         │   │
│  └──────────────────┘        └──────────────────────────┘   │
│                                                               │
│  React Frontend                                               │
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
