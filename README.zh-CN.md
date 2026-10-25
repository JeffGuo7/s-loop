# S-Loop

> AI 桌面工作台 — 集多模型对话、Agent 编排、定时任务、平台接入、语音与桌面宠物于一体的 Tauri 2 应用

[English](README.md)

<p align="center">
  <img src="public/screenshots/chat-light.png" alt="S-Loop 对话界面" width="860" />
</p>

<p align="center">
  <a href="https://github.com/JeffGuo7/s-loop/actions/workflows/ci.yml"><img src="https://github.com/JeffGuo7/s-loop/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/JeffGuo7/s-loop/blob/master/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License"></a>
  <a href="https://github.com/JeffGuo7/s-loop/releases"><img src="https://img.shields.io/github/v/release/JeffGuo7/s-loop?include_prereleases&label=release" alt="Release"></a>
  <a href="https://github.com/JeffGuo7/s-loop/stargazers"><img src="https://img.shields.io/github/stars/JeffGuo7/s-loop?style=flat&logo=github" alt="Stars"></a>
  <a href="https://github.com/JeffGuo7/s-loop/releases/latest"><img src="https://img.shields.io/badge/Download-Windows%20.exe-blue?logo=windows" alt="Download Windows"></a>
  <a href="https://github.com/JeffGuo7/s-loop/releases/latest"><img src="https://img.shields.io/github/downloads/JeffGuo7/s-loop/total?color=blue" alt="Downloads"></a>
</p>

## S-Loop 是什么？

S-Loop 是一款本地优先的 Windows AI 工作台。一个应用里集成：39 个内置模型服务商的流式对话
（DeepSeek、OpenAI、Anthropic、Google、GLM、Moonshot、Qwen 等）、拖拽式 Agent 构建器、
子代理与自主目标循环（Goal Loop）、Cron 定时任务、消息平台接入、完全离线的语音输入，
以及一只桌面宠物——底层由成文的安全模型支撑：工作区沙箱、持久化审批、执行审计。

## 功能特性

| 模块 | 说明 |
|------|------|
| **AI 对话** | 流式 SSE 输出、推理过程可视化、工具调用日志、Markdown + Shiki 代码高亮、Mermaid / KaTeX 渲染、表格导出，内置 PDF / Word / Excel / Markdown 预览 |
| **模型接入** | 基于 pi SDK 内置 39 个服务商——DeepSeek、OpenAI、Anthropic、Google、GLM (Z.ai)、Moonshot、Qwen、MiniMax、小米、OpenRouter、xAI、Groq 等——支持自定义 OpenAI 兼容端点；按服务商管理 API Key，模型感知的推理强度控制 |
| **Agent 构建器** | 自定义 Agent（指令 / 模型 / Skills / MCP / 权限模式）、斜杠命令、拖拽编排、Agent 配置档案 |
| **子代理与目标循环** | `delegate_task` / 并行 / 链式子代理，带预算与取消；Goal Loop 按计划-执行-检查推进多步任务，独立审批流 |
| **MCP** | 基于 pi 1.4 内置的 MCP 客户端——Streamable HTTP 与 stdio 传输、OAuth 2.1 + PKCE 回环签名、按服务器工具过滤、DPAPI 加密静态密钥、`mcp__<server>__<tool>` 命名 |
| **Skills 系统** | 本地 `SKILL.md` 扫描、远程搜索安装、ZIP 拖拽安装、CLI 集成 |
| **定时任务** | Cron / 间隔 / 一次性，绑定 Agent + Skills 快照，可投递到聊天或平台；无人值守运行遇到审批会挂起（`waiting_for_approval`），决策后自动恢复 |
| **平台消息中心** | Telegram（双向聊天同步）、Email、Webhook、飞书、钉钉、微信、Slack、Discord、QQ Bot——白名单优先的访问控制 + 限速 |
| **语音** | 完全离线的语音识别（whisper.cpp / sherpa-onnx）、Kokoro TTS 音色、实时语音模式 |
| **联网搜索** | Bing / Brave / SearXNG / Tavily / Exa 五引擎切换，默认零配置可用 |
| **PPTX 生成** | 原生 PowerPoint 生成与工作区预览 |
| **桌面宠物** | SVG 动画宠物、独立透明窗口、多状态切换、多主题包 |
| **主题系统** | 9 套色系 × 深色/浅色、毛玻璃效果、CSS 变量驱动实时切换 |

## 界面预览

<p align="center">
  <img src="public/screenshots/chat-dark.png" alt="暗色主题" width="49%" />
  <img src="public/screenshots/agent-builder.png" alt="智能体构建器" width="49%" />
</p>
<p align="center">
  <img src="public/screenshots/providers.png" alt="模型服务商" width="49%" />
  <img src="public/screenshots/skills.png" alt="技能系统" width="49%" />
</p>
<p align="center">
  <img src="public/screenshots/platforms.png" alt="平台消息中心" width="49%" />
  <img src="public/screenshots/tasks.png" alt="定时任务" width="49%" />
</p>
<p align="center">
  <img src="public/screenshots/goals.png" alt="目标循环" width="49%" />
  <img src="public/screenshots/mcp.png" alt="MCP 服务器" width="49%" />
</p>
<p align="center">
  <img src="public/screenshots/workspace.png" alt="工作区文件树" width="49%" />
  <img src="public/screenshots/pet.png" alt="桌面宠物" width="49%" />
</p>

## 安全模型

S-Loop 将模型输出视为不可信输入。完整基线见
[docs/security-model.md](docs/security-model.md)，要点：

- 本地 sidecar 要求**每次启动重新生成的访问令牌**（常量时间校验、经子进程环境变量传递、
  不落盘），配合 Origin 白名单，只绑定回环地址。
- 文件工具被限制在**工作区根目录**内，读 / 写权限分离——即使在 `allow` 模式下，
  写出可写根目录也会被拒绝。
- Shell 命令经过**两级策略**（硬性禁止 / 需审批）；MCP 工具默认 ask，
  未标注的未知工具一律 fail-closed。
- 获批的 Shell 命令在 Windows 上运行于 **OS 级 AppContainer 沙箱**（零 capability：
  无网络，文件系统仅限工作区）——不只是策略检查。Git/MSYS 工具无法在容器内运行，
  需要时可按会话关闭（`execSandbox: false`）。
- 无人值守运行**在审批处挂起**并可在重启后恢复；每次决策落入可校验的
  **持久化审计日志**。
- MCP 凭据经 **Windows DPAPI** 加密；子进程拿到的是净化环境（无 API Key、
  无 `NODE_OPTIONS`），应用退出时整个进程树一并回收。
- WebView 强制严格 CSP，所有模型渲染的 HTML 都经过消毒。

## 架构

```
┌─ Tauri 2 ───────────────────────────────────────────────────────┐
│                                                                  │
│  Rust 后端                          Node.js AI 引擎              │
│  ┌────────────────────┐          ┌─────────────────────────┐    │
│  │ pi_server.rs       │◄────────►│ pi-server (HTTP + SSE)  │    │
│  │  sidecar 生命周期   │  token   │  会话与流式输出          │    │
│  │ credential_store   │          │  mcp-runtime (pi-mcp)   │    │
│  │ skill_installer    │          │  子代理 / goal-loop     │    │
│  │ skills_cli         │          │  task-scheduler 定时    │    │
│  │ voice / dictation  │          │  platform-center 平台   │    │
│  │ 系统托盘            │          │  策略 / 审计            │    │
│  └────────────────────┘          └─────────────────────────┘    │
│                                                                  │
│  React 前端                                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ ChatView │ AgentBuilder │ TasksPage │ GoalPage │ PetPage │   │
│  │ SettingsModal │ WorkspacePanel │ MCP │ Skills │ Platforms│   │
│  │ WebSearch │ Preview │ Voice │ i18n │ Themes              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

- **Rust 层** —— 窗口/托盘生命周期、sidecar 启动（Windows Job Object 进程树回收 +
  净化子环境变量）、MCP 静态密钥的 DPAPI 凭据保险库、离线语音
  （whisper.cpp + sherpa-onnx）与 Kokoro TTS。
- **pi-server（Node 子进程）** —— 会话与流式输出、HTTP 路由模块（`routes/`）、工具
  策略引擎、工作区沙箱、子代理、Goal Loop、定时调度、平台中心、持久化审批与审计。
  以 `pi-server.zip` 形式打包，首次启动由应用解压并配合内置 Node 运行时拉起。
- **React 前端** —— 全部 UI，经回环 HTTP + SSE 携带每次启动的令牌与 sidecar 通信。

## 快速开始

### 开发

```bash
git clone https://github.com/JeffGuo7/s-loop.git
cd s-loop
npm install
npm run tauri:dev
```

> 前置要求：Node.js ≥ 20、Rust ≥ 1.85 (MSVC)、npm。
> 首次 Rust 构建会编译内置语音引擎；CI 已缓存 sherpa-onnx 预编译库。

若将 Vite 与 `pi-server` 作为两个独立进程分别启动，请在 `VITE_S_LOOP_API_TOKEN`
与 `S_LOOP_API_TOKEN` 中设置相同的临时值，前端才能通过 sidecar 鉴权。

### 下载（Windows）

从 [Releases 页面](https://github.com/JeffGuo7/s-loop/releases/latest) 下载最新安装包。

| 格式 | 文件 |
|------|------|
| 安装版（推荐，按用户安装） | `S-Loop_<version>_x64-setup.exe` |
| 系统级安装（MSI） | `S-Loop_<version>_x64_en-US.msi` |

安装包内嵌 `pi-server.zip`，首次启动时自动解压到安装目录并在 `127.0.0.1:4096`
拉起 sidecar，无需额外配置——在设置里填入模型服务商的 API Key 即可使用。

## 测试

```bash
npm test                       # 前端（vitest）
npm run test:server            # pi-server 单测 + HTTP 路由冒烟测试（node:test）
npm run native:test:speech     # stt crate
cargo test --manifest-path src-tauri/Cargo.toml   # 原生层
npx tsc --noEmit               # 类型检查
```

CI（`.github/workflows/ci.yml`）执行类型检查与两套 Node 测试，并对 Rust 层追加
`cargo fmt --check`、`cargo clippy -D warnings` 和 `cargo test` 三个质量门。

## 构建与发布

```bash
npm run tauri:build            # NSIS + MSI 安装包输出到 src-tauri/target/release/bundle
node scripts/publish-release.mjs --dry-run   # 校验、构建并定位产物
node scripts/publish-release.mjs             # 构建 + 创建 GitHub Release
```

## 项目结构

```
src/                    React 前端（组件、状态、i18n、主题）
src-tauri/src/          Rust 层：sidecar 生命周期、MCP 管理、凭据、语音
src-tauri/pi-server/    Node AI 引擎：index.mjs + routes/ + 策略/审批/审计存储
stt/                    Rust 语音引擎（whisper.cpp、sherpa-onnx、Kokoro TTS）
docs/                   安全模型与设计文档
tests/                  前端 vitest 测试
scripts/                打包与发布脚本
```

## License

[MIT](LICENSE)
