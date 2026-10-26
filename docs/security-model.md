# S-Loop Security Model

Status: accepted baseline for the security/runtime roadmap  
Scope: desktop app, `pi-server`, tools, MCP, scheduled tasks, platform replies,
Goal Loop, and sub-agents

## 1. Purpose

S-Loop is a local desktop agent that can read files, modify a workspace, execute
commands, call MCP tools, and send data to external services. This document defines
the security rules that every execution surface must share.

This is an application-level policy boundary plus, on Windows, an OS-level
containment layer for shell execution: approved commands run inside a
zero-capability AppContainer (see §14, phase 8). Other surfaces (file tools, MCP
transports) remain policy-bounded rather than OS-bounded.

## 2. Trust boundaries

The protected assets are:

- files outside user-authorized roots;
- credentials, environment variables, connector tokens, and MCP secrets;
- local `pi-server` APIs and event streams;
- external accounts and destinations;
- task, goal, approval, and audit state;
- the authority assigned to a parent agent.

Untrusted or partially trusted inputs include:

- model-generated tool calls;
- prompts and attachments;
- repository content and repository-owned configuration;
- installed Skills and extensions;
- MCP server schemas and tool results;
- remote platform messages;
- web content returned by search or browser tools;
- any web page capable of reaching localhost.

## 3. Non-negotiable invariants

These rules take precedence over agent configuration and model instructions:

1. A tool call is evaluated by one shared policy engine before execution.
2. `allow` mode does not bypass hardline destructive-command rules, sensitive-host
   path rules, or authorized-root boundaries.
3. Unknown tools and tools without security metadata fail closed and require approval.
4. Writes are allowed only under roots explicitly marked `read-write`.
5. A sub-agent can never receive more authority than its parent.
6. Unattended execution never converts an approval requirement into automatic consent.
7. Standing approvals bind an exact tool to an exact target and never cover arbitrary
   shell commands or unrestricted local writes.
8. The local sidecar requires a per-launch secret for HTTP, SSE, and WebSocket access.
9. Credentials must not enter prompts, model-visible traces, URLs, or normal logs.
10. A retried or resumed external side effect must carry an idempotency identity.

## 4. Permission and interaction are separate dimensions

S-Loop keeps its three user-facing permission modes:

| Mode | Read | Local write | Shell | External/MCP side effect |
|---|---|---|---|---|
| `allow` | Allow | Allow inside writable roots | Allow unless hardline-blocked | Allow unless a stricter tool rule applies |
| `ask` | Allow | Ask | Ask | Ask by default |
| `deny` | Deny tool execution | Deny | Deny | Deny |

Tool-specific rules may only keep or reduce the authority granted by the mode. They
must not bypass the non-negotiable invariants.

Interaction mode is independent:

| Interaction | Approval/question handling |
|---|---|
| `attended` | Show an inline request and wait for the user |
| `unattended` | Persist the request in the Inbox, park the run, and resume after a decision |

Changing interaction mode does not change the permission mode.

For compatibility, existing saved agents retain their explicit mode. New agents should
default to `ask` once the migration is implemented.

## 5. Tool security metadata

Every built-in, extension, Skill-provided, and MCP tool must resolve to metadata with
this logical shape:

```ts
type ToolRisk = 'read' | 'write-local' | 'exec' | 'external'

interface ToolSecurityMetadata {
  risk: ToolRisk
  pathArguments?: string[]
  targetArgument?: string
  approvalDefault: 'allow' | 'ask' | 'deny'
  parallelSafe?: boolean
  source: 'builtin' | 'extension' | 'skill' | 'mcp'
}
```

Name-based inference is a compatibility fallback for vetted built-ins only. It is not
an authority source for third-party or previously unknown tools.

Base risk rules:

- `read`: no durable local or external side effect;
- `write-local`: changes files or local application state;
- `exec`: starts a command, process, package manager, or interpreter;
- `external`: sends, creates, deletes, or mutates data outside the machine.

MCP tools default to `external` plus `ask` until the user records a narrower local
override. A remote server's own description cannot lower its risk.

## 6. Policy evaluation order

The policy engine evaluates a call in this order and stops on the first hard denial:

1. Validate the tool exists and has valid security metadata.
2. Apply hardline command and sensitive-host-path blocks.
3. Resolve all declared path arguments canonically, including existing symlink
   ancestors, and enforce root access.
4. Intersect parent and child authority for delegated calls.
5. Apply global mode (`allow`, `ask`, or `deny`).
6. Apply stricter tool/category rules.
7. Check session-scoped approvals.
8. Check task-scoped exact-target standing approvals.
9. Return `allow`, `deny`, or `approval-required` with a machine-readable reason.

The decision object must include the effective risk, matched rule, resolved targets,
and whether a human decision is required. This information feeds both UI and audit.

## 7. Workspace roots

The target model is:

```ts
interface WorkspaceRoot {
  id: string
  path: string
  access: 'read' | 'read-write'
  primary: boolean
  source: 'workspace' | 'user-grant' | 'task'
}
```

Rules:

- exactly one primary root exists for a workspace-bound session;
- relative paths resolve against the primary root;
- reads may use any authorized root;
- writes require a `read-write` root;
- roots are canonicalized and compared case-insensitively on Windows;
- a missing leaf is canonicalized through its nearest existing ancestor;
- an agent requests additional access through a dedicated directory request; it cannot
  add roots directly;
- changing roots updates the running session immediately and is audited.

Shell approval is not proof of path isolation. On Windows approved commands are
additionally confined by an OS-level AppContainer sandbox (see §14, phase 8);
elsewhere the shell remains a high-risk host capability under policy control only.

### Full filesystem access (explicit opt-in)

The workspace bar exposes an access-scope selector:

- `workspace` (default): the rules above apply.
- `full`: the workspace-root check is skipped for file tools and the shell runs
  outside the AppContainer. This is for trusted local automations that need to
  read/write arbitrary user paths.

Even in `full` mode:

- hardline commands (disk formatting, `rm -rf /`, …) remain blocked;
- file-tool writes to system and credential paths (`%WINDIR%`,
  `C:\Program Files`, `~/.ssh`, browser profiles, …) remain blocked by
  `checkSensitivePath`;
- the shell is **not** AppContainer-isolated, so an approved shell command can
  write outside those file-tool guards; the UI shows this warning whenever
  `full` is selected;
- tool approval (`ask`/`allow`/`deny`) still applies independently.

The choice is persisted locally and sent to the sidecar per prompt
(`filesystemAccess`) and through `/runtime/config` for autonomous runs.

## 8. Delegation

The effective child policy is the intersection of:

- the parent mode and tool rules;
- the child definition's requested mode and tool list;
- the parent's authorized roots;
- the execution surface's interaction mode.

A child may remove tools, request read-only roots, or switch from `allow` to `ask`/`deny`.
It may not add tools, writable roots, secrets, or standing approvals that the parent
does not possess.

Explorer is a fixed profile with read/search/git-query tools only, no shell, no writes,
no external sends, and no recursive delegation.

## 9. Attended, unattended, and durable approval

An approval record contains:

- request ID and tool call ID;
- session, task/goal, agent, and parent IDs;
- redacted arguments and resolved target;
- risk, reason, and matched policy rule;
- creation/expiry timestamps;
- decision and deciding user;
- idempotency key and resume checkpoint.

Unattended runs transition:

```text
running -> waiting_for_approval -> resuming -> completed | failed
                              \-> denied
```

No tool is executed before approval. On restart, S-Loop resumes from the unanswered
tool call and must not repeat calls already recorded as completed.

Standing approvals are owned by one task or automation and have the form
`tool -> exact target`. They are eligible only for external side effects with a
declared target argument. Shell and local-write tools are never eligible.

## 10. Local sidecar boundary

Binding to `127.0.0.1` is necessary but insufficient because an untrusted web page can
attempt to reach localhost.

The desktop shell must:

- generate a high-entropy token for every sidecar launch;
- pass it through the child environment, not command-line arguments;
- inject it into the trusted webview before application code starts;
- never persist or log it.

The sidecar must:

- require constant-time token verification on HTTP, SSE, and WebSocket traffic;
- allow only trusted Tauri and development origins;
- permit unauthenticated preflight and a minimal health response only where needed;
- limit body/frame sizes and request rates;
- bind only to loopback.

Known trade-offs of this boundary:

- A request without an `Origin` header (curl, other local processes, most webhook
  senders) cannot be matched against the origin allowlist, so it passes the origin
  check. Public routes (health, MCP OAuth callback, platform inbound) therefore rely
  on their business-layer authentication: platform inbound verifies the per-platform
  webhook signature and applies whitelist + rate limiting before the AI is triggered.
  Every non-public route still requires the per-launch token.
- The webview CSP is enforced in `tauri.conf.json` (`csp` for production, a looser
  `devCsp` for the Vite dev server). Model-rendered HTML is additionally sanitized
  in the renderer (`markdownSchema.ts`, DOMPurify for document previews) so that a
  CSP regression cannot directly turn model output into script execution.

## 11. Secrets and child processes

S-Loop retains its sanitized child environment and Windows Job Object behavior.
Only an explicit environment allowlist plus per-server MCP configuration reaches child
processes. API keys, tokens, `NODE_OPTIONS`, `NODE_PATH`, and unrelated parent variables
are excluded.

Secret values are stored through an OS-protected secret interface. Plain configuration
may reference a secret, but must not contain its resolved value in model-visible state.

## 12. Audit requirements

The durable audit lifecycle is:

```text
proposed -> policy_decided -> approval_requested -> approval_resolved
         -> started -> completed | failed | interrupted
```

Audit events identify the session, agent, execution surface, tool, risk, matched rule,
resolved resource, status, and standing approval. Values whose keys or semantics imply
tokens, passwords, authorization headers, cookies, message bodies, or typed browser
input are redacted before persistence.

## 13. Required contract tests

Each execution surface (chat, scheduled task, Goal Loop, platform reply, sub-agent, and
MCP) must run against the same matrix:

1. `allow` cannot escape roots or bypass hardline blocks.
2. `ask` auto-allows reads and requests approval for writes, shell, and external calls.
3. `deny` executes no model-proposed tool.
4. Unknown/unannotated tools require approval.
5. Read-only roots reject writes without offering an override.
6. A child cannot exceed parent mode, roots, or tool set.
7. Unattended approval parks and survives restart.
8. Resume executes an approved call once.
9. Standing approval matches only its exact target.
10. Unauthorized browser-origin and missing-token sidecar requests fail.
11. Audit output contains no configured secret.
12. Closing the desktop process terminates its managed process tree.

## 14. Current gaps and roadmap mapping

Status of the baseline review's implementation gaps:

- ~~`pi-server` allows wildcard CORS and has no per-launch API token~~: phase 1
  complete. The sidecar enforces an origin allowlist plus a per-launch token
  (`http-security.mjs`), and the token is generated per launch and passed through
  the child environment (`pi_server.rs`).
- ~~`accessiblePaths` does not distinguish read-only and writable roots~~: phase 2
  complete. `workspaceRoots` carries `read`/`read-write` access and primary flags
  (`sandbox.mjs`); legacy string `accessiblePaths` entries are still accepted for
  rolling upgrades and keep their historical read-write meaning.
- ~~third-party tool risk relies on name/category inference~~: phase 3 complete.
  Tools resolve structured security metadata (`tool-security.mjs`); MCP tools
  default to `external` + `ask`, unknown tools fail closed, and name inference
  survives only as a compatibility fallback for vetted built-ins.
- ~~non-interactive approvals are blocked rather than parked~~: phase 4 complete.
  Unattended runs park in `waiting_for_approval` and resume from the recorded
  tool call after a decision (`task-scheduler.mjs`, durable approval store).
- ~~tool policy and execution do not share a durable audit store~~: phase 5
  complete. Policy decisions and run outcomes append to the durable audit store
  with redaction, exposed via `/audit/events` and verifiable via `/audit/verify`.
- remote MCP uses layered config, DPAPI-backed secret references, tool filters, and
  OAuth 2.1/PKCE: phase 6 complete.
- delegation derives a formal least-authority envelope and includes a fixed Explorer
  contract: phase 7 complete.
- ~~approved shell commands are not OS-isolated~~: phase 8 **partially shipped**.
  On Windows every bash command runs through `sloop-runbox` (runbox crate) in a
  zero-capability AppContainer: no network at all, and filesystem access limited
  to the workspace, explicitly granted roots, a private temp directory and the
  bundled busybox runtime. Containment is enforced by the OS, not the policy
  engine. Known limits: Git/MSYS binaries cannot run inside an AppContainer (the
  MSYS runtime needs `\BaseNamedObjects` shared memory), so `git` is unavailable
  inside the sandbox; disabling it per session (`execSandbox: false`) restores
  full shell capability at the cost of containment. Non-Windows platforms still
  have policy-only containment.

Remaining known limitations:

- OS-protected credential storage exists on Windows only (DPAPI). On other
  platforms the vault refuses to operate instead of falling back to plaintext.
- The webview CSP and renderer-side sanitization (see §10) bound the
  model-HTML attack surface, but both must stay in place; removing either
  reopens script execution from model output.

Security changes should continue to follow the phase order so later features
depend on one policy decision model rather than adding surface-specific
exceptions.
