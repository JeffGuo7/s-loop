import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { Agent } from '@earendil-works/pi-agent-core'
import { getModel, getModels } from '@earendil-works/pi-ai/compat'
import { createCodingTools, createReadOnlyTools } from '@earendil-works/pi-coding-agent'
import { webSearch, fetchUrl, resetBrowser } from './searchProviders.mjs'
import { createDefaultEngine, calculateContextTokens, truncateContent } from './context-engine/index.mjs'
import {
  createContextSnapshot,
  deleteContextSnapshot,
  loadContextSnapshot,
  restoreContextFromSnapshot,
  saveContextSnapshot,
} from './context-engine/snapshot-store.mjs'
import { createSessionRepo, findSession } from './session-store.mjs'
import {
  init as initTasks,
  loadTasks,
  getTask,
  createTask,
  updateTask,
  removeTask,
  getTaskOutputs,
  runTask,
  startTicker,
  markTaskApprovalResuming,
  markTaskWaitingForApproval,
} from './task-scheduler.mjs'
import {
  clearPlatformMessages,
  connectPlatform,
  getPlatformConfig,
  disconnectPlatform,
  getPlatformSnapshot,
  initPlatformCenter,
  recordPlatformMessage,
  sendPlatformMessage,
  testPlatform,
  updatePlatformConfig,
  recordPlatformContact,
  getPlatformContacts,
} from './platform-center.mjs'
import { initTelegramMonitor, startTelegramMonitor, stopTelegramMonitor } from './telegram-monitor.mjs'
import {
  getPlatformChatSyncSnapshot,
  initTelegramChatSync,
  recordPlatformInbound,
  recordPlatformOutbound,
} from './telegram-chat-sync.mjs'
import { withRetry } from './retry.js'
import { discoverAgents, formatAgentList, loadAgentDefinition } from './subagent/agent-registry.mjs'
import { runSubagent, runParallel, runChain } from './subagent/index.mjs'
import { cancelSubagentRun, listSubagentRuns } from './subagent/run-store.mjs'
import { initGoalPersistence, loadGoals, getGoal, createGoal, updateGoal, deleteGoal, saveGoalRunOutput } from './goal-loop/persistence.mjs'
import { runGoalLoop } from './goal-loop/index.mjs'
import { createGoalApprovalCoordinator } from './goal-loop/approval.mjs'
import { tryGetAdapter } from './platforms/registry.mjs'
import { authorizeInbound } from './platforms/access-control.mjs'
import { ToolGuard } from './tool-guardrails.mjs'
import { evaluateToolCall } from './execution-policy.mjs'
import { sanitizeChildEnvironment } from './sandbox.mjs'
import { init as initExtensions, listExtensions, installExtension, removeExtension, reloadAll, getExtensionTools, fireExtensionEvent, createContext } from './extension-runtime.mjs'
import {
  callSseMcpTool,
  completeSseMcpOAuth,
  connectSseMcpServer,
  disconnectAllSseMcp,
  disconnectSseMcpServer,
  getAllSseMcpTools,
  getSseMcpOAuthCredentials,
  getSseMcpStatus,
} from './mcp-sse.mjs'
import { guardSidecarRequest } from './http-security.mjs'
import { buildToolSecurityIndex } from './tool-security.mjs'
import {
  applyThinkingLevel,
  describeModel,
  describeReasoningCapabilities,
  resolveCustomReasoningConfig,
  resolveThinkingLevel,
} from './reasoning-capabilities.mjs'
import {
  completeApproval,
  consumeApprovedApproval,
  createApprovalRequest,
  initApprovalStore,
  listApprovals,
  resolveApproval,
  waitForApproval,
} from './approval-store.mjs'
import {
  createPlatformRun,
  findPlatformRun,
  getPlatformRun,
  initPlatformRunStore,
  updatePlatformRun,
} from './platform-run-store.mjs'
import {
  appendAuditEvent,
  createToolAuditTracker,
  initAuditStore,
  listAuditEvents,
  verifyAuditTrail,
} from './audit-store.mjs'
import { assembleRuntimeSystemPrompt } from './runtime-prompt.mjs'
import { filterRemoteMcpTools } from './mcp-scope.mjs'

// Force UTF-8 for all child processes spawned by tools (bash, python, etc.)
// On Windows Git Bash, the default codepage is GBK which causes
// UnicodeEncodeError when piping API responses through Python.
// Setting PYTHONUTF8=1 tells Python to ignore the terminal codepage
// and use UTF-8 unconditionally. Node.js inherits these for child_process.
process.env.LANG = process.env.LANG || 'en_US.UTF-8';
process.env.LC_ALL = process.env.LC_ALL || 'en_US.UTF-8';
process.env.PYTHONUTF8 = '1';
process.env.PYTHONIOENCODING = 'utf-8';

const PORT = parseInt(process.env.PI_SERVER_PORT || '4096')
const API_TOKEN = process.env.SNOTRA_API_TOKEN || ''
const DATA_DIR = process.env.S_LOOP_PROJECT_DIR || process.env.SNOTRA_PROJECT_DIR || process.cwd()
const sessionRepo = createSessionRepo(DATA_DIR)
const sessions = new Map()
const inboundSeen = new Map()
const goalLoopControllers = new Map()  // goalId → AbortController
const platformRunsInFlight = new Set()
const runtimeConfig = {
  providerID: 'anthropic',
  modelID: 'claude-sonnet-4-20250514',
  apiKey: process.env.PI_API_KEY || '',
  providerApiKeys: {},
  agentMcpServers: undefined,
  agentMcpTools: undefined,
  workspaceDir: undefined,
  workspaceRoots: [],
  providerConfig: {},
}

function runtimeRemoteMcpScope(config = {}) {
  const hasServerScope = Array.isArray(config.agentMcpServers)
  const hasToolScope = Array.isArray(config.agentMcpTools)
  if (!hasServerScope && !hasToolScope) return undefined
  return {
    serverNames: hasServerScope ? config.agentMcpServers : [],
    tools: hasToolScope ? config.agentMcpTools : [],
  }
}

function createCustomModel(providerID, modelID, providerConfig = {}) {
  const api = providerConfig.api || 'openai-completions'
  const baseUrl = providerConfig.baseUrl || ''
  const reasoningConfig = resolveCustomReasoningConfig(providerID, modelID, providerConfig)
  // Custom models can declare vision support via providerConfig.supportsVision
  const supportsVision = providerConfig.supportsVision === true
  return {
    id: modelID,
    name: modelID,
    api,
    provider: providerID,
    baseUrl,
    reasoning: reasoningConfig.reasoning,
    thinkingLevelMap: reasoningConfig.thinkingLevelMap,
    input: supportsVision ? ['text', 'image'] : ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    contextLength: 128000,
    maxTokens: 4096,
    ...(reasoningConfig.compat ? { compat: reasoningConfig.compat } : {}),
  }
}

function resolveModel(providerID, modelID, providerConfig = {}) {
  const builtIn = getModel(providerID, modelID)
  if (builtIn) return builtIn
  if (providerConfig?.api || providerConfig?.baseUrl) {
    return createCustomModel(providerID, modelID, providerConfig)
  }
  return null
}

async function fetchOpenAiCompatibleModels(baseUrl, apiKey) {
  const url = new URL('/models', baseUrl.replace(/\/$/, ''))
  const headers = {}
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
  try {
    const res = await fetch(url.toString(), { headers })
    if (!res.ok) return []
    const data = await res.json()
    const models = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []
    return models.map((m) => ({ id: m.id, name: m.id })).filter((m) => m.id)
  } catch (err) {
    console.warn('[pi-server] failed to fetch custom provider models:', err)
    return []
  }
}

function createSSE(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function getTools(dir, webSearchConfig, remoteMcpScope) {
  const toolRoot = dir || process.cwd()
  const bashOptions = {
    spawnHook: ({ command, env }) => ({
      command,
      cwd: toolRoot,
      env: sanitizeChildEnvironment(env, toolRoot),
    }),
  }
  const all = [
    ...createCodingTools(toolRoot, { bash: bashOptions }),
    ...createReadOnlyTools(toolRoot),
  ]

  // Merge tools from loaded pi.dev extensions
  const extTools = getExtensionTools()
  if (extTools.length > 0) {
    console.log(`[pi-server] adding ${extTools.length} extension tool(s)`)
    all.push(...extTools)
  }

  // Merge tools from connected SSE MCP servers
  const sseMcpTools = filterRemoteMcpTools(getAllSseMcpTools(), remoteMcpScope)
  if (sseMcpTools.length > 0) {
    console.log(`[pi-server] adding ${sseMcpTools.length} SSE MCP tool(s)`)
    all.push(...sseMcpTools)
  }

  const seen = new Set()
  const tools = all.filter(t => { if (seen.has(t.name)) return false; seen.add(t.name); return true })
  if (!seen.has('web_search')) {
    const providerName = webSearchConfig?.provider || 'bing'
    tools.push({
      name: 'web_search', label: 'Web Search',
      description: `Search the web and return results with URLs, titles, and snippets.`,
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'Search query.' } }, required: ['query'] },
      execute: async (_id, params) => {
        const query = params.query
        console.log(`[webSearch] query: ${JSON.stringify(query)}`)
        if (/^[\u4e00-\u9fff]{1,2}$/.test(query.trim())) {
          return { content: [{ type: 'text', text: `Search query "${query}" is too short. Use a complete phrase.` }], details: {} }
        }
        const result = await webSearch(query, webSearchConfig)
        if (result.error) {
          return { content: [{ type: 'text', text: `Search failed: ${result.error}` }], details: {} }
        }
        if (!result.results.length) {
          return { content: [{ type: 'text', text: 'No results found.' }], details: {} }
        }
        const text = result.results.map(r =>
          `[${r.position}] ${r.title}\n   URL: ${r.url}\n   ${r.description}`
        ).join('\n\n')
        return { content: [{ type: 'text', text }], details: {} }
      },
    })
  }
  if (!seen.has('web_fetch')) {
    tools.push({
      name: 'web_fetch', label: 'Web Fetch',
      description: 'Fetch the full content of a web page. Use this to read articles, documentation, or any web page content. Provide a URL to get its readable text content.',
      parameters: { type: 'object', properties: { url: { type: 'string', description: 'The URL to fetch and read' } }, required: ['url'] },
      execute: async (_id, params) => {
        const result = await fetchUrl(params.url)
        if (result.error) {
          return { content: [{ type: 'text', text: `Fetch failed: ${result.error}` }], details: {} }
        }
        return { content: [{ type: 'text', text: result.content }], details: {} }
      },
    })
  }
  if (!seen.has('get_current_time')) {
    tools.push({
      name: 'get_current_time', label: 'Get Current Time',
      description: 'Get the current date, time, and timezone. Use this when you need to know the actual current time.',
      parameters: { type: 'object', properties: {} },
      execute: async () => {
        const now = new Date()
        const text = now.toLocaleString('zh-CN', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          weekday: 'long', timeZoneName: 'short',
        })
        return { content: [{ type: 'text', text: `Current time: ${text}\nISO: ${now.toISOString()}` }], details: {} }
      },
    })
  }

  return tools
}

// ── Sub-agent tool factories ─────────────────────────────

function createDelegateTaskTool({ runtimeConfig, resolveModel, getTools, projectDir, emit, wrapper }) {
  return {
    name: 'delegate_task',
    label: 'Delegate Task',
    description: `Delegate a task to a specialized sub-agent. Available agents: ${(() => {
      const { agents } = discoverAgents(projectDir)
      return formatAgentList(agents)
    })()}. The sub-agent runs with an isolated context (clean message history) and tool whitelist. Use this to break complex work into focused subtasks.`,
    parameters: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Name of the sub-agent to invoke (e.g., researcher, coder, reviewer).' },
        task: { type: 'string', description: 'Detailed task description for the sub-agent. Be specific about what you want done.' },
      },
      required: ['agent', 'task'],
    },
    execute: async (_toolCallId, params, signal, onUpdate) => {
      console.log('[pi-server] delegate_task:', { agent: params.agent, task: params.task?.slice(0, 80) })

      // Forward sub-agent events as SSE tool updates
      const result = await runSubagent({
        agentName: params.agent,
        task: params.task,
        parentConfig: {
          providerID: runtimeConfig.providerID,
          modelID: runtimeConfig.modelID,
          apiKey: runtimeConfig.apiKey,
          workspaceDir: wrapper?.config?.workspaceDir || runtimeConfig.workspaceDir,
          workspaceRoots: wrapper?.config?.workspaceRoots || runtimeConfig.workspaceRoots || [],
          accessiblePaths: wrapper?.config?.accessiblePaths || [],
          webSearchConfig: wrapper?.config?.webSearchConfig,
          providerConfig: runtimeConfig.providerConfig,
          permissionMode: wrapper?.config?.permissionMode,
          permissionRules: wrapper?.config?.permissionRules,
          toolSecurity: wrapper?.config?.toolSecurity,
          agentId: wrapper?.auditContext?.actor || 'chat',
          delegationDepth: wrapper?.config?.delegationDepth || 0,
        },
        resolveModel,
        getTools,
        signal,
        projectDir: projectDir || runtimeConfig.workspaceDir,
        requestToolApproval: (toolCall) => authorizeToolCall(wrapper, toolCall, wrapper.config, { audit: false }),
        auditContext: wrapper?.auditContext,
        onUpdate: onUpdate
          ? (ev) => {
              // Structured sub-agent event — frontend can render as live progress
              onUpdate({
                content: [
                  {
                    type: 'text',
                    text: ev.type === 'text_delta'
                      ? ev.delta || ''
                      : ev.type === 'tool_start'
                        ? `Tool: ${ev.toolName}`
                        : ev.type === 'tool_end'
                          ? `Tool done: ${ev.toolName}`
                          : `[${ev.type}]`,
                  },
                ],
                details: {
                  subagentEvent: ev,
                },
              })
            }
          : undefined,
      })

      const isError = result.exitCode !== 0 || result.stopReason === 'error' || result.stopReason === 'aborted'
      const output = result.finalOutput || result.errorMessage || '(no output)'

      return {
        content: [
          {
            type: 'text',
            text: isError
              ? `Sub-agent "${result.agent}" failed: ${output}`
              : output,
          },
        ],
        details: {
          runId: result.runId,
          agent: result.agent,
          exitCode: result.exitCode,
          usage: result.usage,
          budget: result.budget,
          durationMs: result.durationMs,
          model: result.model,
          stopReason: result.stopReason,
          errorMessage: result.errorMessage,
        },
        isError,
      }
    },
  }
}

function createDelegateParallelTool({ runtimeConfig, resolveModel, getTools, projectDir, emit, wrapper }) {
  return {
    name: 'delegate_parallel',
    label: 'Delegate Parallel',
    description: `Delegate multiple tasks in parallel to sub-agents. Each task runs independently with isolated context. Max 8 tasks, 4 concurrent. Available agents: ${(() => {
      const { agents } = discoverAgents(projectDir)
      return formatAgentList(agents)
    })()}`,
    parameters: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              agent: { type: 'string', description: 'Sub-agent name' },
              task: { type: 'string', description: 'Task description' },
            },
            required: ['agent', 'task'],
          },
          description: 'Array of { agent, task } to execute in parallel',
        },
      },
      required: ['tasks'],
    },
    execute: async (_toolCallId, params, signal) => {
      const tasks = params.tasks || []
      if (tasks.length > 8) {
        return {
          content: [{ type: 'text', text: `Too many parallel tasks (${tasks.length}). Max is 8.` }],
          details: {},
          isError: true,
        }
      }

      console.log('[pi-server] delegate_parallel:', tasks.length, 'tasks')

      const results = await runParallel(tasks, 4, {
        parentConfig: {
          providerID: runtimeConfig.providerID,
          modelID: runtimeConfig.modelID,
          apiKey: runtimeConfig.apiKey,
          workspaceDir: wrapper?.config?.workspaceDir || runtimeConfig.workspaceDir,
          workspaceRoots: wrapper?.config?.workspaceRoots || runtimeConfig.workspaceRoots || [],
          accessiblePaths: wrapper?.config?.accessiblePaths || [],
          webSearchConfig: wrapper?.config?.webSearchConfig,
          providerConfig: runtimeConfig.providerConfig,
          permissionMode: wrapper?.config?.permissionMode,
          permissionRules: wrapper?.config?.permissionRules,
          toolSecurity: wrapper?.config?.toolSecurity,
          agentId: wrapper?.auditContext?.actor || 'chat',
          delegationDepth: wrapper?.config?.delegationDepth || 0,
        },
        resolveModel,
        getTools,
        signal,
        projectDir: projectDir || runtimeConfig.workspaceDir,
        requestToolApproval: (toolCall) => authorizeToolCall(wrapper, toolCall, wrapper.config, { audit: false }),
        auditContext: wrapper?.auditContext,
      })

      const successCount = results.filter((r) => r.exitCode === 0 && !r.errorMessage).length
      const summaries = results.map((r) => {
        const status = r.exitCode === 0 ? 'OK' : `FAILED${r.stopReason ? ` (${r.stopReason})` : ''}`
        const output = r.finalOutput || r.errorMessage || '(no output)'
        const preview = output.length > 500 ? output.slice(0, 500) + '...' : output
        return `### [${r.agent}] ${status}\n\n${preview}`
      })

      return {
        content: [
          {
            type: 'text',
            text: `Parallel: ${successCount}/${results.length} succeeded\n\n${summaries.join('\n\n---\n\n')}`,
          },
        ],
        details: { results },
      }
    },
  }
}

// ── Sub-agent endpoint helpers ────────────────────────────

function createDelegateChainTool({ runtimeConfig, resolveModel, getTools, projectDir, emit, wrapper }) {
  return {
    name: 'delegate_chain',
    label: 'Delegate Chain',
    description: `Run multiple sub-agents in sequence. Each step receives the previous step's output as context. Use {previous} in task strings. Available agents: ${(() => {
      const { agents } = discoverAgents(projectDir)
      return formatAgentList(agents)
    })()}`,
    parameters: {
      type: 'object',
      properties: {
        chain: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              agent: { type: 'string', description: 'Sub-agent name' },
              task: { type: 'string', description: 'Task description. Use {previous} to reference the output from the prior step.' },
            },
            required: ['agent', 'task'],
          },
          description: 'Array of { agent, task } to execute in sequence. Each step gets the previous result via {previous}.',
        },
      },
      required: ['chain'],
    },
    execute: async (_toolCallId, params, signal) => {
      const chain = params.chain || []
      if (chain.length > 6) {
        return { content: [{ type: 'text', text: 'Chain limit is 6 steps.' }], isError: true }
      }
      console.log('[pi-server] delegate_chain:', chain.length, 'steps')
      const result = await runChain(chain, {
        parentConfig: {
          providerID: runtimeConfig.providerID,
          modelID: runtimeConfig.modelID,
          apiKey: runtimeConfig.apiKey,
          workspaceDir: wrapper?.config?.workspaceDir || runtimeConfig.workspaceDir,
          workspaceRoots: wrapper?.config?.workspaceRoots || runtimeConfig.workspaceRoots || [],
          accessiblePaths: wrapper?.config?.accessiblePaths || [],
          webSearchConfig: wrapper?.config?.webSearchConfig,
          providerConfig: runtimeConfig.providerConfig,
          permissionMode: wrapper?.config?.permissionMode,
          permissionRules: wrapper?.config?.permissionRules,
          toolSecurity: wrapper?.config?.toolSecurity,
          agentId: wrapper?.auditContext?.actor || 'chat',
          delegationDepth: wrapper?.config?.delegationDepth || 0,
        },
        resolveModel,
        getTools,
        signal,
        projectDir: projectDir || runtimeConfig.workspaceDir,
        requestToolApproval: (toolCall) => authorizeToolCall(wrapper, toolCall, wrapper.config, { audit: false }),
        auditContext: wrapper?.auditContext,
      })
      return { content: [{ type: 'text', text: result.finalOutput }], details: { steps: result.results } }
    },
  }
}

function getSubagentList(projectDir) {
  const { agents, builtinDir, userDir } = discoverAgents(projectDir)
  return agents.map((a) => ({
    name: a.name,
    description: a.description,
    model: a.model,
    tools: a.tools,
    source: a.source,
    maxTurns: a.maxTurns,
    maxTokens: a.maxTokens,
    thinkingLevel: a.thinkingLevel,
    permissionMode: a.permissionMode,
    systemPromptPreview: a.systemPrompt.slice(0, 200),
  }))
}

// ── Server ───────────────────────────────────────────────

process.on('uncaughtException', (err) => console.error('[pi-server] UNCAUGHT:', err))
process.on('unhandledRejection', (err) => console.error('[pi-server] UNHANDLED:', err))

function extractAssistantText(last) {
  let text = ''
  if (last?.content) {
    text = last.content.find(c => c.type === 'text')?.text || ''
    if (!text) text = last.content.find(c => c.type === 'thinking')?.text || ''
    if (!text) {
      for (const c of last.content) {
        if (typeof c.text === 'string' && c.text) {
          text = c.text
          break
        }
      }
    }
  }
  if (!text && last?.errorMessage) text = `Error: ${last.errorMessage}`
  return text || ''
}

async function getOrCreateWrapper(sessionId, autoCreate = false) {
  let wrapper = sessions.get(sessionId)
  if (wrapper) return wrapper

  const metadata = await findSession(sessionRepo, sessionId)
  if (metadata) {
    const session = await sessionRepo.open(metadata)
    const contextSnapshot = await loadContextSnapshot(DATA_DIR, sessionId)
    wrapper = { session, agent: null, emit: null, contextEngine: null, contextSnapshot, persistedMessageCount: 0, apiKey: '', config: {}, mcpToolRequests: new Map() }
    sessions.set(sessionId, wrapper)
    fireExtensionEvent('session_start', { sessionId }, { sessionId })
    return wrapper
  }

  if (!autoCreate) return null

  const session = await sessionRepo.create({ cwd: DATA_DIR, id: sessionId })
  wrapper = { session, agent: null, emit: null, contextEngine: null, contextSnapshot: null, persistedMessageCount: 0, apiKey: '', config: {}, mcpToolRequests: new Map() }
  sessions.set(sessionId, wrapper)
  fireExtensionEvent('session_start', { sessionId }, { sessionId })
  return wrapper
}

async function persistAgentMessages(wrapper) {
  if (!wrapper?.agent || !wrapper?.session) return
  const previousCount = wrapper.previousMessageCount || 0
  const messages = wrapper.agent.state.messages.slice(previousCount)
  for (const message of messages) {
    await wrapper.session.appendMessage(message)
  }
  wrapper.persistedMessageCount = (wrapper.persistedMessageCount || 0) + messages.length
  wrapper.previousMessageCount = wrapper.agent.state.messages.length
}

function createMcpToolDefinition(tool, wrapper, sessionId) {
  return {
    name: tool.name,
    label: `${tool.serverName}/${tool.name}`,
    description: tool.description || `MCP tool ${tool.name}`,
    parameters: tool.inputSchema || { type: 'object', properties: {} },
    _sandboxCategory: 'mcp',
    executionMode: 'parallel',
    execute: async (_toolCallId, params, signal) => callMcpTool(wrapper, sessionId, tool.serverName, tool.name, params, signal),
  }
}

function createChatToolBundle({
  wrapper,
  sessionId,
  provider,
  modelId,
  apiKey,
  thinkingLevel,
  providerConfig,
  workspaceDir,
  webSearchConfig,
  mcpTools,
  allowedSseMcpToolNames,
}) {
  const cwd = workspaceDir || process.cwd()
  const baseTools = getTools(
    cwd,
    webSearchConfig,
    allowedSseMcpToolNames === undefined
      ? undefined
      : { toolNames: allowedSseMcpToolNames },
  )
  const mcpToolDefs = Array.isArray(mcpTools)
    ? mcpTools.map((tool) => createMcpToolDefinition(tool, wrapper, sessionId))
    : []
  const delegateRuntimeConfig = {
    ...runtimeConfig,
    providerID: provider,
    modelID: modelId,
    apiKey,
    thinkingLevel,
    providerConfig,
  }
  const delegateOptions = {
    runtimeConfig: delegateRuntimeConfig,
    resolveModel,
    getTools,
    projectDir: workspaceDir || DATA_DIR,
    wrapper,
  }
  const delegationTools = [
    createDelegateTaskTool(delegateOptions),
    createDelegateParallelTool(delegateOptions),
    createDelegateChainTool(delegateOptions),
  ]

  return {
    baseTools,
    mcpToolDefs,
    delegationTools,
    tools: [...baseTools, ...mcpToolDefs, ...delegationTools],
  }
}

function rejectPendingMcpRequests(wrapper, reason) {
  if (!wrapper?.mcpToolRequests) return
  for (const [requestId, resolver] of wrapper.mcpToolRequests.entries()) {
    resolver(undefined, reason || 'Session ended')
  }
  wrapper.mcpToolRequests.clear()
}

async function callMcpTool(wrapper, sessionId, serverName, toolName, args, signal) {
  if (!wrapper.mcpToolRequests) wrapper.mcpToolRequests = new Map()
  const requestId = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  const timeout = setTimeout(() => {
    wrapper.mcpToolRequests.delete(requestId)
    reject(new Error(`MCP tool call timed out: ${serverName}/${toolName}`))
  }, 60_000)
  let onAbort
  if (signal) {
    onAbort = () => {
      wrapper.mcpToolRequests.delete(requestId)
      clearTimeout(timeout)
      reject(new Error('aborted'))
    }
    if (signal.aborted) {
      onAbort()
      return promise
    }
    signal.addEventListener('abort', onAbort, { once: true })
  }
  wrapper.mcpToolRequests.set(requestId, (result, error) => {
    if (signal) signal.removeEventListener('abort', onAbort)
    clearTimeout(timeout)
    wrapper.mcpToolRequests.delete(requestId)
    if (error) reject(new Error(error))
    else resolve(result)
  })
  try {
    const emit = wrapper.emit
    if (!emit) throw new Error('No active stream to forward MCP tool request')
    emit('mcp_tool_request', { requestId, serverName, toolName, arguments: args })
  } catch (err) {
    if (signal) signal.removeEventListener('abort', onAbort)
    wrapper.mcpToolRequests.delete(requestId)
    clearTimeout(timeout)
    throw err
  }
  const result = await promise
  return {
    content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result) }],
    details: result,
  }
}

async function requestToolApproval(wrapper, toolCall, reason) {
  const generation = wrapper.approvalGeneration || 0
  const runRequest = async () => {
    if ((wrapper.approvalGeneration || 0) !== generation) return false
    if (!wrapper.emit) return false
    const requestId = `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    wrapper.pendingToolApprovals = wrapper.pendingToolApprovals || new Map()
    const approvalPromise = new Promise((resolve) => {
      const timeout = setTimeout(() => {
        wrapper.pendingToolApprovals?.delete(requestId)
        resolve(false)
      }, 60_000)
      wrapper.pendingToolApprovals.set(requestId, (approved) => {
        clearTimeout(timeout)
        wrapper.pendingToolApprovals?.delete(requestId)
        resolve(approved)
      })
    })
    wrapper.emit('tool_approval_request', {
      requestId,
      toolName: toolCall.name,
      args: toolCall.arguments || {},
      reason,
    })
    return await approvalPromise
  }

  // Parallel tool calls must not overwrite each other's approval dialogs.
  const previous = wrapper.approvalQueue || Promise.resolve()
  const current = previous.catch(() => undefined).then(runRequest)
  wrapper.approvalQueue = current.then(() => undefined, () => undefined)
  return await current
}

function rejectPendingToolApprovals(wrapper) {
  if (!wrapper) return
  wrapper.approvalGeneration = (wrapper.approvalGeneration || 0) + 1
  for (const resolver of wrapper.pendingToolApprovals?.values?.() || []) resolver(false)
  wrapper.pendingToolApprovals?.clear?.()
}

async function authorizeToolCall(wrapper, toolCall, config, {
  interactive = true,
  audit = true,
} = {}) {
  const decision = evaluateToolCall(toolCall, config)
  const toolAudit = audit ? wrapper?.toolAudit : null
  toolAudit?.decision(toolCall, decision)
  if (decision.allowed) {
    toolAudit?.started(toolCall)
    return undefined
  }
  if (!decision.approvalRequired) return { block: true, reason: decision.reason }
  if (!interactive) {
    return { block: true, reason: `${decision.reason}; interactive approval is unavailable` }
  }
  const approved = await requestToolApproval(wrapper, toolCall, decision.reason)
  if (!approved) return { block: true, reason: 'User rejected or approval timed out' }
  toolAudit?.started(toolCall)
  return undefined
}

async function readJsonBody(req) {
  return await new Promise((resolve, reject) => {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

async function readRawJsonBody(req, { maxBytes = 64 * 1024, timeoutMs = 5000 } = {}) {
  return await new Promise((resolve, reject) => {
    let body = ''
    let size = 0
    const timer = setTimeout(() => {
      req.destroy()
      reject(new Error('Request body timeout'))
    }, timeoutMs)

    req.on('data', (chunk) => {
      size += chunk.length
      if (size > maxBytes) {
        clearTimeout(timer)
        req.destroy()
        reject(new Error('Request body too large'))
        return
      }
      body += chunk
    })
    req.on('end', () => {
      clearTimeout(timer)
      try {
        resolve({
          raw: body,
          data: body ? JSON.parse(body) : {},
        })
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

function normalizePlatformInbound(platformId, payload) {
  const adapter = tryGetAdapter(platformId)
  if (!adapter?.normalizeInbound) return null
  return adapter.normalizeInbound(payload)
}

function verifyPlatformInbound(platformId, rawBody, payload, headers) {
  const platform = getPlatformConfig(platformId)
  if (!platform?.connected) {
    return { ok: false, error: `${platform?.name || platformId} 未连接` }
  }
  const adapter = tryGetAdapter(platformId)
  if (!adapter?.verifyInbound) return { ok: true }
  return adapter.verifyInbound(rawBody, payload, headers, platform)
}

function shouldProcessInbound(incoming) {
  const key = `${incoming.platformId}:${incoming.messageId}`
  const now = Date.now()
  for (const [seenKey, timestamp] of inboundSeen.entries()) {
    if (now - timestamp > 10 * 60_000) {
      inboundSeen.delete(seenKey)
    }
  }
  if (inboundSeen.has(key)) {
    return false
  }
  inboundSeen.set(key, now)
  return true
}

async function promptPlatformConversation(sessionId, content, platformRun, resumeApprovalId) {
  const provider = runtimeConfig.providerID || 'anthropic'
  const modelId = runtimeConfig.agentModel || runtimeConfig.modelID || 'claude-sonnet-4-20250514'
  const model = resolveModel(provider, modelId, runtimeConfig.providerConfig)
  if (!model) {
    throw new Error(`Unknown model "${modelId}" for provider "${provider}"`)
  }

  // Honor the active agent's instructions + skills (synced via /runtime/config).
  // MCP tools are excluded — they require a live frontend SSE proxy that a
  // platform message can't rely on. Skills are prompt text, so they work here.
  const systemPrompt = assembleRuntimeSystemPrompt({
    agentSystemPrompt: runtimeConfig.agentSystemPrompt,
    agentSkillsBlock: runtimeConfig.agentSkillsBlock,
    surfacePrompt: '## External Platform Channel\nKeep replies concise, readable, and appropriate for the current messaging platform.',
    fallbackPrompt: 'You are a helpful assistant. Follow safety, permission, and tool rules.',
  })

  const wrapper = await getOrCreateWrapper(sessionId, true)
  const ctx = wrapper.agent ? null : await wrapper.session.buildContext()
  const fullInitialMessages = ctx?.messages || []
  const initialMessages = restoreContextFromSnapshot(fullInitialMessages, wrapper.contextSnapshot)
  wrapper.persistedMessageCount = fullInitialMessages.length
  if (!wrapper.agent) {
    const cwd = runtimeConfig.workspaceDir || process.cwd()
    const tools = getTools(
      cwd,
      runtimeConfig.webSearchConfig,
      runtimeRemoteMcpScope(runtimeConfig),
    )
    wrapper.config = {
      ...runtimeConfig,
      toolSecurity: buildToolSecurityIndex(tools),
    }
    wrapper.agent = new Agent({
      initialState: {
        systemPrompt,
        model,
        tools,
        thinkingLevel: 'off',
        messages: initialMessages,
      },
      sessionId,
      getApiKey: async () => runtimeConfig.apiKey || '',
      beforeToolCall: async ({ toolCall }) => {
        const decision = evaluateToolCall(toolCall, wrapper.config)
        const execution = wrapper.platformExecution
        execution?.toolAudit.decision(toolCall, decision)
        if (decision.allowed) {
          execution?.toolAudit.started(toolCall)
          return undefined
        }
        if (!decision.approvalRequired) {
          return { block: true, reason: decision.reason }
        }

        if (!execution) {
          return { block: true, reason: `${decision.reason}; durable approval context is unavailable` }
        }
        execution.pauseTimeout()

        if (execution.resumeApprovalId) {
          const resumed = consumeApprovedApproval(execution.resumeApprovalId, {
            surface: 'platform',
            surfaceId: execution.platformRun.id,
            toolName: toolCall.name,
            args: toolCall.arguments || {},
            toolCallId: toolCall.id,
          })
          if (resumed) {
            execution.executingApprovals.set(toolCall.id, resumed.id)
            execution.resumeApprovalId = undefined
            updatePlatformRun(execution.platformRun.id, {
              status: 'resuming',
              pendingApprovalId: undefined,
            })
            execution.armTimeout()
            execution.toolAudit.started(toolCall)
            return undefined
          }
        }

        const approval = createApprovalRequest({
          surface: 'platform',
          surfaceId: execution.platformRun.id,
          sessionId,
          runId: execution.platformRun.runId,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          args: toolCall.arguments || {},
          reason: decision.reason,
          risk: decision.risk,
          source: decision.source,
          matchedRule: decision.matchedRule,
          resolvedTargets: decision.resolvedTargets,
        })
        updatePlatformRun(execution.platformRun.id, {
          status: 'waiting_for_approval',
          pendingApprovalId: approval.id,
        })
        const approved = await waitForApproval(approval.id)
        if (!approved) {
          execution.deniedReason = `Approval denied or interrupted for ${toolCall.name}`
          return {
            block: true,
            reason: execution.deniedReason,
          }
        }

        execution.executingApprovals.set(toolCall.id, approval.id)
        updatePlatformRun(execution.platformRun.id, {
          status: 'resuming',
          pendingApprovalId: undefined,
        })
        execution.armTimeout()
        execution.toolAudit.started(toolCall)
        return undefined
      },
      afterToolCall: async ({ result, toolCall }) => {
        const execution = wrapper.platformExecution
        execution?.toolAudit.finished(toolCall, result)
        const approvalId = execution?.executingApprovals.get(toolCall?.id)
        if (approvalId) {
          execution.executingApprovals.delete(toolCall.id)
          completeApproval(approvalId, result?.isError ? 'failed' : 'completed')
        }
        return undefined
      },
      toolExecution: 'sequential',
    })
    wrapper.previousMessageCount = initialMessages.length
  } else {
    wrapper.agent.state.model = model
    const tools = getTools(
      runtimeConfig.workspaceDir || process.cwd(),
      runtimeConfig.webSearchConfig,
      runtimeRemoteMcpScope(runtimeConfig),
    )
    wrapper.agent.state.tools = tools
    wrapper.config = {
      ...runtimeConfig,
      toolSecurity: buildToolSecurityIndex(tools),
    }
    if (wrapper.agent.state.systemPrompt !== systemPrompt) {
      wrapper.agent.state.systemPrompt = systemPrompt
    }
  }

  let timeoutId
  const execution = {
    platformRun,
    resumeApprovalId,
    executingApprovals: new Map(),
    deniedReason: '',
    timedOut: false,
    toolAudit: createToolAuditTracker({
      surface: 'platform',
      surfaceId: platformRun.id,
      runId: platformRun.runId,
    }),
    pauseTimeout() {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = undefined
    },
    armTimeout() {
      this.pauseTimeout()
      timeoutId = setTimeout(() => {
        this.timedOut = true
        try { wrapper.agent.abort() } catch {}
      }, 120_000)
    },
  }
  wrapper.platformExecution = execution
  execution.armTimeout()
  try {
    await wrapper.agent.prompt(content)
    if (execution.deniedReason) throw new Error(execution.deniedReason)
    if (execution.timedOut) throw new Error('Platform conversation timed out')
  } finally {
    execution.pauseTimeout()
    if (wrapper.platformExecution === execution) {
      wrapper.platformExecution = undefined
    }
  }
  try {
    await persistAgentMessages(wrapper)
  } catch (persistErr) {
    console.error('[pi-server] failed to persist platform session messages:', persistErr)
  }
  const last = [...wrapper.agent.state.messages].reverse().find((message) => message.role === 'assistant')
  return extractAssistantText(last)
}

async function executePlatformRun(platformRun, { resumeApprovalId } = {}) {
  if (platformRunsInFlight.has(platformRun.id)) {
    throw new Error('Platform run is already active')
  }
  platformRunsInFlight.add(platformRun.id)
  appendAuditEvent(resumeApprovalId ? 'run.resumed' : 'run.started', {
    surface: 'platform',
    surfaceId: platformRun.id,
    runId: platformRun.runId,
    actor: `platform:${platformRun.platformId}`,
    outcome: 'running',
  })
  const platform = getPlatformConfig(platformRun.platformId)
  if (!resumeApprovalId) {
    updatePlatformRun(platformRun.id, {
      status: 'running',
      error: undefined,
    })
  }

  try {
    const reply = await promptPlatformConversation(
      platformRun.sessionId,
      platformRun.incoming.text,
      platformRun,
      resumeApprovalId,
    )
    if (!reply.trim()) {
      updatePlatformRun(platformRun.id, {
        status: 'completed',
        replied: false,
        pendingApprovalId: undefined,
      })
      appendAuditEvent('run.completed', {
        surface: 'platform',
        surfaceId: platformRun.id,
        runId: platformRun.runId,
        actor: `platform:${platformRun.platformId}`,
        outcome: 'completed',
        details: { replied: false },
      })
      return { ok: true, replied: false }
    }

    await sendPlatformMessage(
      platformRun.platformId,
      reply,
      platformRun.sendOptions || {},
    )
    recordPlatformOutbound({
      ...platformRun.incoming,
      text: reply,
      replyKey: platformRun.incoming.messageId,
    })
    updatePlatformRun(platformRun.id, {
      status: 'completed',
      replied: true,
      reply,
      pendingApprovalId: undefined,
    })
    appendAuditEvent('run.completed', {
      surface: 'platform',
      surfaceId: platformRun.id,
      runId: platformRun.runId,
      actor: `platform:${platformRun.platformId}`,
      outcome: 'completed',
      details: { replied: true },
    })
    return { ok: true, replied: true }
  } catch (error) {
    updatePlatformRun(platformRun.id, {
      status: 'failed',
      error: error?.message || String(error),
      pendingApprovalId: undefined,
    })
    appendAuditEvent('run.failed', {
      surface: 'platform',
      surfaceId: platformRun.id,
      runId: platformRun.runId,
      actor: `platform:${platformRun.platformId}`,
      outcome: 'failed',
      details: { error: error?.message || String(error) },
    })
    throw error
  } finally {
    platformRunsInFlight.delete(platformRun.id)
  }
}

async function processPlatformInbound(platformId, incoming, options = {}) {
  // Access control + rate limiting before doing any work or invoking the AI.
  const platform = getPlatformConfig(platformId)
  const auth = authorizeInbound(platform, incoming)
  if (!auth.ok) {
    const who = incoming.username || incoming.fromId || incoming.chatId || 'unknown'
    console.log(`[pi-server] ${platformId} inbound blocked (${auth.reason}) from ${who}`)
    // Surface blocked attempts in the message log so the owner can see them
    // and configure the whitelist — but do NOT reply to the sender.
    recordPlatformMessage(platformId, 'received', `[已拦截 ${auth.reason}] ${who}: ${incoming.text}`)
    return { ok: false, blocked: true, reason: auth.reason }
  }

  recordPlatformMessage(platformId, 'received', incoming.text)
  recordPlatformInbound(incoming)
  // Track who messaged us so the owner can manage access visually
  recordPlatformContact(platformId, incoming.username || '', String(incoming.fromId || ''), String(incoming.chatId || ''))
  // Session id doubles as part of a session filename, so it must be
  // filesystem-safe. Colons (from platform:conversation:thread) are
  // illegal in Windows filenames — replace any unsafe char with '_'.
  const sessionId = `${platformId}:${incoming.conversationId}`.replace(/[:<>"/\\|?* -]/g, '_')
  const existingRun = findPlatformRun(platformId, incoming.messageId)
  if (existingRun) {
    return {
      ok: true,
      duplicate: true,
      status: existingRun.status,
    }
  }
  const platformRun = createPlatformRun({
    platformId,
    sessionId,
    incoming,
    sendOptions: options.sendOptions || {},
  })
  // Best-effort typing indicator while the AI generates (adapters that
  // support it, e.g. Telegram). Never block or fail the flow on this.
  const adapter = tryGetAdapter(platformId)
  if (adapter?.sendTyping) {
    adapter.sendTyping(platform, options.sendOptions || {}).catch(() => {})
  }
  try {
    return await executePlatformRun(platformRun)
  } catch (err) {
    console.error(`[pi-server] ${platformId} inbound failed:`, err)
    const fallback = `S-Loop 处理消息失败：${err?.message || String(err)}`
    await sendPlatformMessage(platformId, fallback, options.sendOptions || {}).catch(() => {})
    recordPlatformOutbound({
      ...incoming,
      text: fallback,
      replyKey: `${incoming.messageId}:error`,
    })
    updatePlatformRun(platformRun.id, {
      status: 'failed',
      error: err?.message || String(err),
    })
    return { ok: false, error: err?.message || String(err) }
  }
}

async function ensureTelegramMonitorState() {
  const telegram = getPlatformConfig('telegram')
  const token = telegram.values.botToken?.trim()
  await stopTelegramMonitor()
  if (!telegram.connected || !token) {
    return
  }

  await startTelegramMonitor({
    getToken: async () => getPlatformConfig('telegram').values.botToken?.trim() || '',
    getProxy: async () => getPlatformConfig('telegram').values.proxyUrl?.trim() || '',
    onMessage: async (incoming) => {
      await processPlatformInbound('telegram', { ...incoming, platformId: 'telegram' }, {
        sendOptions: {
          chatId: incoming.chatId,
          threadId: incoming.threadId || undefined,
          replyToMessageId: incoming.messageId,
        },
      })
    },
    onError: (err) => {
      console.error('[pi-server] telegram poller error:', err)
    },
  })
}

// ── Cron prompt helper (shared by ticker and HTTP handler) ──
const createCronPrompt = async (content, options) => {
  try {
    const model = resolveModel(options.providerID, options.modelID, options.providerConfig)
    if (!model) return { text: '', error: 'Model not found' }
    const cwd = options.workspaceDir || process.cwd()
  const tools = getTools(cwd, options.webSearchConfig, runtimeRemoteMcpScope(options))
    const policyConfig = {
      ...options,
      toolSecurity: buildToolSecurityIndex(tools),
    }
    const sysPrompt = assembleRuntimeSystemPrompt({
      agentSystemPrompt: options.agentSystemPrompt,
      agentSkillsBlock: options.agentSkillsBlock,
      surfacePrompt: options.systemPrompt || '## Scheduled Task Runtime\nExecute only the scheduled instruction below. Report the outcome clearly and do not invent successful completion.',
      fallbackPrompt: 'You are a helpful assistant. Follow safety, permission, and tool rules.',
    })
    const fullPrompt = options.workspaceDir ? `${sysPrompt}\n\nWorkspace: ${options.workspaceDir}` : sysPrompt
    const executingApprovals = new Map()
    const toolAudit = createToolAuditTracker({
      surface: 'task',
      surfaceId: options.taskId,
      runId: options.runId,
    })
    let resumeApprovalId = options.resumeApprovalId
    let deniedReason = ''
    const agent = new Agent({
      initialState: {
        systemPrompt: fullPrompt,
        model,
        tools,
        thinkingLevel: 'off',
      },
      sessionId: options.sessionId || 'cron-' + Date.now(),
      getApiKey: async () => options.apiKey || process.env.PI_API_KEY || '',
      beforeToolCall: async ({ toolCall }) => {
        const decision = evaluateToolCall(toolCall, policyConfig)
        toolAudit.decision(toolCall, decision)
        if (decision.allowed) {
          toolAudit.started(toolCall)
          return undefined
        }
        if (!decision.approvalRequired) return { block: true, reason: decision.reason }

        if (resumeApprovalId) {
          const resumed = consumeApprovedApproval(resumeApprovalId, {
            surface: 'task',
            surfaceId: options.taskId,
            toolName: toolCall.name,
            args: toolCall.arguments || {},
            toolCallId: toolCall.id,
          })
          if (resumed) {
            executingApprovals.set(toolCall.id, resumed.id)
            resumeApprovalId = undefined
            markTaskApprovalResuming(options.taskId, options.runId)
            toolAudit.started(toolCall)
            return undefined
          }
        }

        const approval = createApprovalRequest({
          surface: 'task',
          surfaceId: options.taskId,
          sessionId: options.sessionId,
          runId: options.runId,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          args: toolCall.arguments || {},
          reason: decision.reason,
          risk: decision.risk,
          source: decision.source,
          matchedRule: decision.matchedRule,
          resolvedTargets: decision.resolvedTargets,
        })
        markTaskWaitingForApproval(options.taskId, options.runId, approval.id)
        const approved = await waitForApproval(approval.id, { signal: agent.signal })
        if (!approved) {
          deniedReason = `Approval denied for ${toolCall.name}`
          return { block: true, reason: deniedReason }
        }
        executingApprovals.set(toolCall.id, approval.id)
        markTaskApprovalResuming(options.taskId, options.runId)
        toolAudit.started(toolCall)
        return undefined
      },
      afterToolCall: async ({ result, toolCall }) => {
        toolAudit.finished(toolCall, result)
        const approvalId = executingApprovals.get(toolCall?.id)
        if (approvalId) {
          executingApprovals.delete(toolCall.id)
          completeApproval(approvalId, result?.isError ? 'failed' : 'completed')
        }
        return undefined
      },
      toolExecution: 'sequential',
    })
    await agent.prompt(content)
    if (deniedReason) return { text: '', error: deniedReason }
    const msgs = agent.state.messages
    const last = [...msgs].reverse().find(m => m.role === 'assistant')
    const text = last?.content?.find?.(c => c.type === 'text')?.text || last?.content?.find?.(c => c.type === 'thinking')?.text || ''
    return { text: text || '' }
  } catch (err) {
    return { text: '', error: err.message }
  }
}

// ── Server ───────────────────────────────────────────────

function createTaskRunDependencies(task, params = {}, overrides = {}) {
  return {
    projectDir: params.projectDir || task.workspaceDir || runtimeConfig.workspaceDir || process.cwd(),
    apiKey: task.apiKey || params.apiKey || runtimeConfig.apiKey || '',
    defaultProvider: params.defaultProvider || runtimeConfig.providerID || 'anthropic',
    defaultModel: params.defaultModel || runtimeConfig.modelID || 'claude-sonnet-4-20250514',
    prompt: createCronPrompt,
    makeSession: true,
    trigger: overrides.trigger || 'scheduled',
    resumeApprovalId: overrides.resumeApprovalId,
    runtimeConfig,
  }
}

async function executeGoalRun(goalId, {
  resumeApprovalId,
  runId = randomUUID(),
  onUpdate,
} = {}) {
  if (goalLoopControllers.has(goalId)) {
    throw new Error('Goal is already running')
  }

  const storedGoal = getGoal(goalId)
  if (!storedGoal) throw new Error('Goal not found')

  const goal = {
    ...storedGoal,
    status: 'running',
    steps: [],
    plan: null,
    currentStepIndex: -1,
    currentIteration: 0,
    progressNotes: [],
    finalResult: null,
    pendingApprovalId: undefined,
    lastRunId: runId,
  }
  updateGoal(goalId, goal)
  appendAuditEvent(resumeApprovalId ? 'run.resumed' : 'run.started', {
    surface: 'goal',
    surfaceId: goalId,
    runId,
    actor: 'goal-loop',
    outcome: 'running',
  })

  const apiKey = runtimeConfig.apiKey || process.env.PI_API_KEY || ''
  const projectDir = runtimeConfig.workspaceDir || DATA_DIR
  const goalController = new AbortController()
  goalLoopControllers.set(goalId, goalController)

  const approvalCoordinator = createGoalApprovalCoordinator({
    goalState: goal,
    runId,
    resumeApprovalId,
    signal: goalController.signal,
    persistFn: (updated) => updateGoal(goalId, updated),
    onUpdate,
  })

  try {
    const result = await runGoalLoop({
      goalState: goal,
      runtimeConfig: { ...runtimeConfig, apiKey },
      resolveModel: (providerID, modelID, providerConfig) =>
        getModel(providerID, modelID, {
          apiKey,
          ...(providerConfig.api ? { api: providerConfig.api } : {}),
          ...(providerConfig.baseUrl ? { baseUrl: providerConfig.baseUrl } : {}),
        }),
      getTools: (dir, webSearchConfig) => getTools(
        dir,
        webSearchConfig,
        runtimeRemoteMcpScope(runtimeConfig),
      ),
      projectDir,
      signal: goalController.signal,
      persistFn: (updated) => updateGoal(goalId, updated),
      requestToolApproval: approvalCoordinator.request,
      onToolCallFinished: approvalCoordinator.complete,
      auditContext: {
        surface: 'goal',
        surfaceId: goalId,
        runId,
      },
      onUpdate,
    })

    const finalGoal = result.goalState
    const output = finalGoal.status === 'completed'
      ? `# Goal: ${finalGoal.goal}\n\n## Result\n${finalGoal.finalResult || 'Completed'}\n\n## Steps\n${(finalGoal.steps || []).map(s => `- ${s.agent}: ${s.task}`).join('\n')}`
      : `# Goal: ${finalGoal.goal}\n\n## Error\n${finalGoal.finalResult || 'Unknown error'}`
    saveGoalRunOutput(goalId, output)
    appendAuditEvent(
      finalGoal.status === 'completed' ? 'run.completed' : 'run.failed',
      {
        surface: 'goal',
        surfaceId: goalId,
        runId,
        actor: 'goal-loop',
        outcome: finalGoal.status,
        details: {
          stepCount: finalGoal.steps?.length || 0,
          error: finalGoal.status === 'completed' ? undefined : finalGoal.finalResult,
        },
      },
    )
    return result
  } catch (error) {
    appendAuditEvent('run.failed', {
      surface: 'goal',
      surfaceId: goalId,
      runId,
      actor: 'goal-loop',
      outcome: 'failed',
      details: { error: error?.message || String(error) },
    })
    throw error
  } finally {
    goalLoopControllers.delete(goalId)
    resetBrowser().catch(() => {})
  }
}

createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  if (!guardSidecarRequest(req, res, url, API_TOKEN)) return

  if (req.method === 'POST' && url.pathname === '/runtime/config') {
    readJsonBody(req).then((data) => {
      runtimeConfig.providerID = data.providerID || runtimeConfig.providerID
      runtimeConfig.modelID = data.modelID || runtimeConfig.modelID
      runtimeConfig.apiKey = data.apiKey ?? runtimeConfig.apiKey
      runtimeConfig.providerApiKeys = data.providerApiKeys && typeof data.providerApiKeys === 'object'
        ? { ...data.providerApiKeys }
        : runtimeConfig.providerApiKeys
      runtimeConfig.workspaceDir = data.workspaceDir || undefined
      runtimeConfig.thinkingLevel = data.thinkingLevel || runtimeConfig.thinkingLevel
      if (data.providerConfig) runtimeConfig.providerConfig = data.providerConfig
      if (data.webSearchConfig) runtimeConfig.webSearchConfig = data.webSearchConfig
      // Active-agent config for autonomous flows (platform replies, cron)
      runtimeConfig.agentSystemPrompt = data.agentSystemPrompt || undefined
      runtimeConfig.agentSkillsBlock = data.agentSkillsBlock || undefined
      runtimeConfig.agentModel = data.agentModel || undefined
      runtimeConfig.agentMcpServers = Array.isArray(data.agentMcpServers)
        ? [...data.agentMcpServers]
        : undefined
      runtimeConfig.agentMcpTools = Array.isArray(data.agentMcpTools)
        ? data.agentMcpTools.map((tool) => ({ ...tool }))
        : undefined
      runtimeConfig.permissionMode = data.permissionMode || undefined
      runtimeConfig.permissionRules = data.permissionRules || undefined
      runtimeConfig.workspaceRoots = Array.isArray(data.workspaceRoots) ? data.workspaceRoots : []
      // Keep accepting version 0 clients during a rolling upgrade.
      runtimeConfig.accessiblePaths = Array.isArray(data.accessiblePaths) ? data.accessiblePaths : []
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    }).catch((e) => {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    })
    return
  }

  if (req.method === 'GET' && url.pathname === '/approvals') {
    const requestedStatus = url.searchParams.getAll('status')
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(listApprovals({
      status: requestedStatus.length > 0 ? requestedStatus : undefined,
    })))
    return
  }

  if (req.method === 'GET' && url.pathname === '/audit/events') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(listAuditEvents({
      limit: url.searchParams.get('limit') || undefined,
      surface: url.searchParams.get('surface') || undefined,
      runId: url.searchParams.get('runId') || undefined,
    })))
    return
  }

  if (req.method === 'GET' && url.pathname === '/audit/verify') {
    const result = verifyAuditTrail()
    res.writeHead(result.valid ? 200 : 409, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(result))
    return
  }

  const approvalDecisionMatch = url.pathname.match(/^\/approvals\/([^/]+)\/decision$/)
  if (req.method === 'POST' && approvalDecisionMatch) {
    readJsonBody(req).then((data) => {
      const result = resolveApproval(
        approvalDecisionMatch[1],
        data.decision,
        'local-user',
      )
      if (!result) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Approval request not found' }))
        return
      }

      const record = result.record
      const shouldResume = (
        data.decision === 'approve'
        && !result.delivered
        && record.status === 'approved'
      )
      if ((result.changed || shouldResume) && !result.delivered && record.surface === 'task') {
        const task = getTask(record.surfaceId)
        if (shouldResume && task) {
          void runTask(task, createTaskRunDependencies(task, {}, {
            trigger: 'manual',
            resumeApprovalId: record.id,
          })).catch((error) => {
            console.error('[approvals] failed to resume task:', error?.message)
          })
        } else if (data.decision === 'deny' && task?.pendingApprovalId === record.id) {
          updateTask(task.id, {
            lastStatus: 'failed',
            lastError: `Approval denied for ${record.toolName}`,
            lastFinishedAt: Date.now(),
            pendingApprovalId: undefined,
          })
        }
      }
      if ((result.changed || shouldResume) && !result.delivered && record.surface === 'goal') {
        const goal = getGoal(record.surfaceId)
        if (
          shouldResume
          && goal?.status === 'waiting_for_approval'
          && goal.pendingApprovalId === record.id
        ) {
          void executeGoalRun(goal.id, {
            resumeApprovalId: record.id,
            runId: record.runId || randomUUID(),
          }).catch((error) => {
            updateGoal(goal.id, {
              status: 'failed',
              finalResult: error?.message || String(error),
              pendingApprovalId: undefined,
            })
            console.error('[approvals] failed to resume goal:', error?.message)
          })
        } else if (data.decision === 'deny' && goal?.pendingApprovalId === record.id) {
          updateGoal(goal.id, {
            status: 'failed',
            finalResult: `Approval denied for ${record.toolName}`,
            pendingApprovalId: undefined,
          })
        }
      }
      if ((result.changed || shouldResume) && !result.delivered && record.surface === 'platform') {
        const platformRun = getPlatformRun(record.surfaceId)
        if (
          shouldResume
          && platformRun?.status === 'waiting_for_approval'
          && platformRun.pendingApprovalId === record.id
        ) {
          void executePlatformRun(platformRun, {
            resumeApprovalId: record.id,
          }).catch((error) => {
            console.error('[approvals] failed to resume platform run:', error?.message)
          })
        } else if (
          data.decision === 'deny'
          && platformRun?.pendingApprovalId === record.id
        ) {
          updatePlatformRun(platformRun.id, {
            status: 'failed',
            error: `Approval denied for ${record.toolName}`,
            pendingApprovalId: undefined,
          })
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result.record))
    }).catch((error) => {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    })
    return
  }

  if (req.method === 'GET' && url.pathname === '/platforms/chat-sync') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(getPlatformChatSyncSnapshot()))
    return
  }

  const platformInboundMatch = url.pathname.match(/^\/platforms\/inbound\/([a-z0-9_-]+)$/)
  if (req.method === 'POST' && platformInboundMatch && tryGetAdapter(platformInboundMatch[1])?.inboundMode === 'webhook') {
    const platformId = platformInboundMatch[1]
    const contentType = String(req.headers['content-type'] || '')
    if (!contentType.includes('application/json')) {
      res.writeHead(415, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Content-Type must be application/json' }))
      return
    }
    readRawJsonBody(req).then(async ({ raw, data }) => {
      const auth = verifyPlatformInbound(platformId, raw, data, req.headers)
      if (!auth.ok) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: auth.error }))
        return
      }
      const incoming = normalizePlatformInbound(platformId, data)
      if (!incoming) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, ignored: true }))
        return
      }
      if (incoming.challenge) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ challenge: incoming.challenge }))
        return
      }
      if (!shouldProcessInbound(incoming)) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, duplicate: true }))
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, accepted: true }))
      void processPlatformInbound(platformId, incoming)
    }).catch((e) => {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    })
    return
  }

  // ── Platform endpoints ──
  if (req.method === 'GET' && url.pathname === '/platforms') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(getPlatformSnapshot()))
    return
  }

  // GET /platforms/contacts — known inbound senders for visual access control
  if (req.method === 'GET' && url.pathname === '/platforms/contacts') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(getPlatformContacts()))
    return
  }

  if (req.method === 'DELETE' && url.pathname === '/platforms/messages') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(clearPlatformMessages()))
    return
  }

  const platformConfigMatch = url.pathname.match(/^\/platforms\/([^/]+)\/config$/)
  if (req.method === 'POST' && platformConfigMatch) {
    readJsonBody(req).then((data) => {
      try {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(updatePlatformConfig(platformConfigMatch[1], data.values || {})))
        if (platformConfigMatch[1] === 'telegram') {
          void ensureTelegramMonitorState()
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
    }).catch((e) => {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    })
    return
  }

  const platformConnectMatch = url.pathname.match(/^\/platforms\/([^/]+)\/connect$/)
  if (req.method === 'POST' && platformConnectMatch) {
    readJsonBody(req).then(async (data) => {
      try {
        const snapshot = await connectPlatform(platformConnectMatch[1], data.values || {})
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(snapshot))
        if (platformConnectMatch[1] === 'telegram') {
          void ensureTelegramMonitorState()
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
    }).catch((e) => {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    })
    return
  }

  const platformDisconnectMatch = url.pathname.match(/^\/platforms\/([^/]+)\/disconnect$/)
  if (req.method === 'POST' && platformDisconnectMatch) {
    try {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(disconnectPlatform(platformDisconnectMatch[1])))
      if (platformDisconnectMatch[1] === 'telegram') {
        void ensureTelegramMonitorState()
      }
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    }
    return
  }

  const platformSendMatch = url.pathname.match(/^\/platforms\/([^/]+)\/send$/)
  if (req.method === 'POST' && platformSendMatch) {
    readJsonBody(req).then(async (data) => {
      try {
        const snapshot = await sendPlatformMessage(platformSendMatch[1], data.text || '')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(snapshot))
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
    }).catch((e) => {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    })
    return
  }

  const platformTestMatch = url.pathname.match(/^\/platforms\/([^/]+)\/test$/)
  if (req.method === 'POST' && platformTestMatch) {
    readJsonBody(req).then(async (data) => {
      try {
        const snapshot = await testPlatform(platformTestMatch[1], data.text || '')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(snapshot))
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
    }).catch((e) => {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    })
    return
  }

  // ── Task endpoints ──
  if (req.method === 'GET' && url.pathname === '/tasks') {
    const tasks = loadTasks()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(tasks))
    return
  }

  if (req.method === 'POST' && url.pathname === '/tasks/create') {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        const task = createTask(JSON.parse(body))
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(task))
      } catch (e) {
        res.writeHead(400)
        res.end(JSON.stringify({ error: e.message }))
      }
    })
    return
  }

  if (req.method === 'POST' && url.pathname === '/tasks/tick') {
    const due = getDueTasks()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ due: due.length }))
    return
  }

  const taskRunMatch = url.pathname.match(/^\/tasks\/run\/(.+)$/)
  if (req.method === 'POST' && taskRunMatch) {
    const taskId = taskRunMatch[1]
    let body = ''
    req.on('data', c => body += c)
    req.on('end', async () => {
      try {
        const task = getTask(taskId)
        if (!task) { res.writeHead(404); res.end('Task not found'); return }

        const params = body ? JSON.parse(body) : {}
        const result = await runTask(
          task,
          createTaskRunDependencies(task, params, { trigger: 'manual' }),
        )
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      } catch (e) {
        res.writeHead(500)
        res.end(JSON.stringify({ error: e.message }))
      }
    })
    return
  }

  if (req.method === 'DELETE' && url.pathname.startsWith('/tasks/')) {
    const taskId = url.pathname.slice(7)
    removeTask(taskId)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  if (req.method === 'PUT' && url.pathname.startsWith('/tasks/')) {
    const taskId = url.pathname.slice(7)
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        const updates = JSON.parse(body)
        const task = updateTask(taskId, updates)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(task || { error: 'Not found' }))
      } catch (e) {
        res.writeHead(400)
        res.end(JSON.stringify({ error: e.message }))
      }
    })
    return
  }

  // GET /tasks/:id/output — execution history
  const taskOutputMatch = url.pathname.match(/^\/tasks\/([^/]+)\/output$/)
  if (req.method === 'GET' && taskOutputMatch) {
    const taskId = taskOutputMatch[1]
    const outputs = getTaskOutputs(taskId)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(outputs))
    return
  }

  // ── Goal endpoints ──

  // GET /goals — list all goals
  if (req.method === 'GET' && url.pathname === '/goals') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(loadGoals()))
    return
  }

  // GET /goals/:id — get single goal
  const goalGetMatch = url.pathname.match(/^\/goals\/([^/]+)$/)
  if (req.method === 'GET' && goalGetMatch && url.pathname !== '/goals/output') {
    const goal = getGoal(goalGetMatch[1])
    if (!goal) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Goal not found' }))
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(goal))
    }
    return
  }

  // POST /goals/create — create a new goal
  if (req.method === 'POST' && url.pathname === '/goals/create') {
    readJsonBody(req).then((data) => {
      try {
        const goal = createGoal(data)
        res.writeHead(201, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(goal))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    }).catch((err) => {
      console.error('[pi-server] goal create error:', err)
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message || 'Bad request' }))
    })
    return
  }

  // PUT /goals/:id — update goal
  const goalUpdateMatch = url.pathname.match(/^\/goals\/([^/]+)\/update$/)
  if (req.method === 'PUT' && goalUpdateMatch) {
    readJsonBody(req).then((data) => {
      try {
        const updated = updateGoal(goalUpdateMatch[1], data)
        if (!updated) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Goal not found' }))
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(updated))
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    }).catch((err) => {
      console.error('[pi-server] goal update error:', err)
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message || 'Bad request' }))
    })
    return
  }

  // DELETE /goals/:id — delete goal
  const goalDeleteMatch = url.pathname.match(/^\/goals\/([^/]+)$/)
  if (req.method === 'DELETE' && goalDeleteMatch) {
    const ok = deleteGoal(goalDeleteMatch[1])
    res.writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok }))
    return
  }

  // POST /goals/:id/run — execute goal (SSE stream)
  const goalRunMatch = url.pathname.match(/^\/goals\/([^/]+)\/run$/)
  if (req.method === 'POST' && goalRunMatch) {
    const goalId = goalRunMatch[1]
    const goal = getGoal(goalId)
    if (!goal) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Goal not found' }))
      return
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    const emit = (event, data) => {
      try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`) } catch {}
    }

    executeGoalRun(goalId, {
      onUpdate: (ev) => {
        emit('goal_event', ev)
      },
    }).then(() => {
      emit('done', {})
      try { res.end() } catch {}
    }).catch((err) => {
      emit('goal_event', { type: 'goal_error', message: err.message || String(err) })
      emit('done', {})
      try { res.end() } catch {}
    })

    return
  }

  // POST /goals/:id/abort — abort running goal
  const goalAbortMatch = url.pathname.match(/^\/goals\/([^/]+)\/abort$/)
  if (req.method === 'POST' && goalAbortMatch) {
    const abortId = goalAbortMatch[1]
    const goal = getGoal(abortId)
    if (goal && (goal.status === 'running' || goal.status === 'waiting_for_approval')) {
      const ctrl = goalLoopControllers.get(abortId)
      if (ctrl) {
        ctrl.abort()
        goalLoopControllers.delete(abortId)
        // Force-reset shared browser — a subagent may have been mid-search
        // and left the puppeteer browser in a bad state.
        resetBrowser().catch(() => {})
      }
      if (goal.pendingApprovalId) {
        resolveApproval(goal.pendingApprovalId, 'deny', 'goal-abort')
      }
      updateGoal(abortId, {
        status: 'aborted',
        finalResult: 'Goal was aborted.',
        pendingApprovalId: undefined,
      })
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  // GET /goals/output/:id — get goal run outputs
  const goalOutputMatch = url.pathname.match(/^\/goals\/output\/([^/]+)$/)
  if (req.method === 'GET' && goalOutputMatch) {
    const outputDir = path.join(DATA_DIR, 'goals', 'output', goalOutputMatch[1])
    let outputs = []
    if (fs.existsSync(outputDir)) {
      outputs = fs.readdirSync(outputDir)
        .filter((f) => f.endsWith('.md'))
        .map((f) => {
          const filePath = path.join(outputDir, f)
          const stat = fs.statSync(filePath)
          return {
            file: f,
            timestamp: parseInt(f.replace('.md', '')) || stat.mtimeMs,
            size: stat.size,
          }
        })
        .sort((a, b) => b.timestamp - a.timestamp)
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(outputs))
    return
  }

  // ── Extension Management endpoints ──

  // GET /extensions — list installed/loaded extensions
  if (req.method === 'GET' && url.pathname === '/extensions') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(listExtensions()))
    return
  }

  // POST /extensions/install — install a pi.dev package
  if (req.method === 'POST' && url.pathname === '/extensions/install') {
    readJsonBody(req).then(async (data) => {
      try {
        const pkg = data.package || data.name
        if (!pkg) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing "package" field' })); return }
        const result = await installExtension(pkg)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
    }).catch((e) => {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    })
    return
  }

  // POST /extensions/remove — uninstall a pi.dev package
  if (req.method === 'POST' && url.pathname === '/extensions/remove') {
    readJsonBody(req).then(async (data) => {
      try {
        const pkg = data.package || data.name
        if (!pkg) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing "package" field' })); return }
        const result = await removeExtension(pkg)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
    }).catch((e) => {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    })
    return
  }

  // POST /extensions/reload — reload all extensions
  if (req.method === 'POST' && url.pathname === '/extensions/reload') {
    reloadAll().then(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    }).catch((e) => {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    })
    return
  }

  // ── SSE MCP Endpoints ──

  // GET /mcp-sse/status — list connected SSE MCP servers and their tools
  const oauthCallbackMatch = url.pathname.match(/^\/mcp-oauth\/callback\/([^/]+)$/)
  if (req.method === 'GET' && oauthCallbackMatch) {
    const name = decodeURIComponent(oauthCallbackMatch[1])
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    if (!code || !state) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<h1>Snotra OAuth failed</h1><p>The authorization response is missing code or state.</p>')
      return
    }
    completeSseMcpOAuth(name, code, state).then(() => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<h1>Authorization complete</h1><p>You can close this window and return to Snotra.</p>')
    }).catch((error) => {
      const message = String(error?.message || error).replace(/[<>&"']/g, '')
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<h1>Snotra OAuth failed</h1><p>${message}</p>`)
    })
    return
  }

  if (req.method === 'GET' && url.pathname === '/mcp-oauth/credentials') {
    const name = url.searchParams.get('name')
    if (!name) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Missing "name"' }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(getSseMcpOAuthCredentials(name)))
    return
  }

  if (req.method === 'GET' && url.pathname === '/mcp-sse/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(getSseMcpStatus()))
    return
  }

  // POST /mcp-sse/connect — connect to an SSE MCP server
  if (req.method === 'POST' && url.pathname === '/mcp-sse/connect') {
    readJsonBody(req).then(async (data) => {
      try {
        const { name, url, headers, transport, auth, toolFilter } = data
        if (!name || !url) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing "name" or "url"' })); return }
        const result = await connectSseMcpServer(
          name,
          url,
          headers || {},
          transport || 'http',
          auth || {},
          toolFilter || {},
        )
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, ...result }))
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
    }).catch((e) => {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    })
    return
  }

  // POST /mcp-sse/disconnect — disconnect from an SSE MCP server
  if (req.method === 'POST' && url.pathname === '/mcp-sse/disconnect') {
    readJsonBody(req).then(async (data) => {
      try {
        const { name } = data
        if (!name) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing "name"' })); return }
        await disconnectSseMcpServer(name)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
    }).catch((e) => {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    })
    return
  }

  // POST /mcp-sse/call — call a tool on an SSE MCP server
  if (req.method === 'POST' && url.pathname === '/mcp-sse/call') {
    readJsonBody(req).then(async (data) => {
      try {
        const { serverName, toolName, arguments: args } = data
        if (!serverName || !toolName) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing "serverName" or "toolName"' })); return }
        const result = await callSseMcpTool(serverName, toolName, args || {})
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
    }).catch((e) => {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    })
    return
  }

  // Clean up SSE MCP connections on server shutdown
  process.on('exit', () => { disconnectAllSseMcp() })

  // ── Existing endpoints ──

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ healthy: true, service: 's-loop-pi-server', port: PORT })); return
  }

  if (req.method === 'GET' && url.pathname === '/subagents') {
    const projectDir = url.searchParams.get('projectDir') || runtimeConfig.workspaceDir || DATA_DIR
    const list = getSubagentList(projectDir)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(list))
    return
  }

  if (req.method === 'GET' && url.pathname === '/subagents/runs') {
    const limit = Number(url.searchParams.get('limit')) || 50
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(listSubagentRuns(limit)))
    return
  }

  const subagentCancelMatch = url.pathname.match(/^\/subagents\/runs\/([^/]+)\/cancel$/)
  if (req.method === 'POST' && subagentCancelMatch) {
    const cancelled = cancelSubagentRun(decodeURIComponent(subagentCancelMatch[1]))
    res.writeHead(cancelled ? 200 : 409, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: cancelled }))
    return
  }

  // POST /subagents/:name — create or update a user sub-agent .md file
  const subagentSaveMatch = url.pathname.match(/^\/subagents\/([^/]+)$/)
  if (req.method === 'POST' && subagentSaveMatch) {
    const agentName = decodeURIComponent(subagentSaveMatch[1])
    readJsonBody(req).then((data) => {
      try {
        const projectDir = data.projectDir || runtimeConfig.workspaceDir || DATA_DIR
        const agentsDir = path.join(projectDir, '.s-loop', 'agents')
        if (!fs.existsSync(agentsDir)) {
          fs.mkdirSync(agentsDir, { recursive: true })
        }

        // Build .md content from frontmatter + body
        const frontmatter = [
          '---',
          `name: ${data.name || agentName}`,
          `description: ${data.description || ''}`,
          data.model ? `model: ${data.model}` : '',
          data.tools && data.tools.length > 0 ? 'tools:' : '',
          ...(data.tools || []).map((t) => `  - ${t}`),
          data.thinkingLevel ? `thinkingLevel: ${data.thinkingLevel}` : '',
          data.maxTurns ? `maxTurns: ${data.maxTurns}` : '',
          data.maxTokens ? `maxTokens: ${data.maxTokens}` : '',
          data.permissionMode ? `permissionMode: ${data.permissionMode}` : '',
          '---',
        ].filter((l) => l !== '').join('\n')

        const md = `${frontmatter}\n\n${data.systemPrompt || ''}`
        const safeName = agentName.replace(/[^\w.-]+/g, '_')
        const filePath = path.join(agentsDir, `${safeName}.md`)
        fs.writeFileSync(filePath, md, 'utf-8')

        // Reload so the new agent is available immediately
        const def = loadAgentDefinition(safeName, projectDir)

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, path: filePath, agent: def }))
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
    }).catch((e) => {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    })
    return
  }

  // DELETE /subagents/:name — delete a user sub-agent .md file
  if (req.method === 'DELETE' && subagentSaveMatch) {
    const agentName = decodeURIComponent(subagentSaveMatch[1])
    const projectDir = url.searchParams.get('projectDir') || runtimeConfig.workspaceDir || DATA_DIR
    const agentsDir = path.join(projectDir, '.s-loop', 'agents')
    const safeName = agentName.replace(/[^\w.-]+/g, '_')
    const filePath = path.join(agentsDir, `${safeName}.md`)

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Agent not found' }))
      }
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    }
    return
  }

  if (req.method === 'GET' && url.pathname === '/models') {
    (async () => {
      const provider = url.searchParams.get('provider') || 'anthropic'
      const apiKey = url.searchParams.get('apiKey') || ''
      const baseUrl = url.searchParams.get('baseUrl') || ''
      const providerConfig = {
        api: url.searchParams.get('api') || undefined,
        baseUrl,
        reasoningSupport: url.searchParams.get('reasoningSupport') || 'auto',
        thinkingFormat: url.searchParams.get('thinkingFormat') || 'auto',
      }
      let list = []
      try {
        const builtIn = getModels(provider).map(describeModel)
        if (builtIn.length > 0) {
          list = builtIn
        } else if (baseUrl) {
          const remoteModels = await fetchOpenAiCompatibleModels(baseUrl, apiKey)
          list = remoteModels.map(({ id }) => describeModel(createCustomModel(provider, id, providerConfig)))
        }
      } catch { }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(list))
    })().catch((e) => {
      console.error('[pi-server] /models error:', e)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify([]))
    })
    return
  }

  if (req.method === 'GET' && url.pathname === '/model-capabilities') {
    const provider = url.searchParams.get('provider') || 'anthropic'
    const modelID = url.searchParams.get('model') || ''
    const providerConfig = {
      api: url.searchParams.get('api') || undefined,
      baseUrl: url.searchParams.get('baseUrl') || '',
      reasoningSupport: url.searchParams.get('reasoningSupport') || 'auto',
      thinkingFormat: url.searchParams.get('thinkingFormat') || 'auto',
    }
    const model = resolveModel(provider, modelID, providerConfig)
    const capabilities = model
      ? describeReasoningCapabilities(model)
      : describeReasoningCapabilities({ reasoning: false })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(capabilities))
    return
  }

  if (req.method === 'POST' && url.pathname === '/session') {
    (async () => {
      const id = randomUUID()
      const session = await sessionRepo.create({ cwd: DATA_DIR, id })
      const metadata = await session.getMetadata()
      sessions.set(metadata.id, { session, agent: null, emit: null, contextEngine: null, apiKey: '', config: {}, mcpToolRequests: new Map() })
      fireExtensionEvent('session_start', { sessionId: metadata.id }, { sessionId: metadata.id })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ id: metadata.id }))
    })().catch((e) => {
      console.error('[pi-server] failed to create session:', e)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message || 'Failed to create session' }))
    })
    return
  }

  const mcpResponseMatch = url.pathname.match(/^\/session\/([^/]+)\/mcp-response$/)
  if (req.method === 'POST' && mcpResponseMatch) {
    const mcpSessionId = mcpResponseMatch[1]
    readJsonBody(req).then(({ requestId, result, error }) => {
      const mcpWrapper = sessions.get(mcpSessionId)
      const resolver = mcpWrapper?.mcpToolRequests?.get(requestId)
      if (!resolver) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'MCP request not found' }))
        return
      }
      mcpWrapper.mcpToolRequests.delete(requestId)
      resolver(result, error)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    }).catch((e) => {
      console.error('[pi-server] failed to handle MCP response:', e)
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message || 'Bad request' }))
    })
    return
  }

  const toolApprovalMatch = url.pathname.match(/^\/session\/([^/]+)\/tool-approval$/)
  if (req.method === 'POST' && toolApprovalMatch) {
    readJsonBody(req).then(({ requestId, approved }) => {
      const sessionWrapper = sessions.get(toolApprovalMatch[1])
      const resolver = sessionWrapper?.pendingToolApprovals?.get(requestId)
      if (!resolver) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Approval request not found or expired' }))
        return
      }
      resolver(approved === true)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    }).catch((e) => {
      console.error('[pi-server] failed to handle tool approval:', e)
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message || 'Bad request' }))
    })
    return
  }

  const abortMatch = url.pathname.match(/^\/session\/([^/]+)\/abort$/)
  if (req.method === 'POST' && abortMatch) {
    const abortSessionId = abortMatch[1]
    const abortWrapper = sessions.get(abortSessionId)
    if (abortWrapper?.agent) {
      console.log('[pi-server] explicit abort for session:', abortSessionId)
      try { abortWrapper.agent.abort() } catch (e) { console.warn('[pi-server] abort error:', e.message) }
    }
    rejectPendingToolApprovals(abortWrapper)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }

  // DELETE /session/:id — remove session from disk and memory
  const deleteSessionMatch = url.pathname.match(/^\/session\/([^/]+)$/)
  if (req.method === 'DELETE' && deleteSessionMatch) {
    const deleteSid = deleteSessionMatch[1]
    ;(async () => {
      try {
        const wrapper = sessions.get(deleteSid)
          if (wrapper) {
            if (wrapper.agent) { try { wrapper.agent.abort() } catch {} }
            rejectPendingMcpRequests(wrapper, 'session deleted')
            rejectPendingToolApprovals(wrapper)
            fireExtensionEvent('session_shutdown', { sessionId: deleteSid }, { sessionId: deleteSid })
            sessions.delete(deleteSid)
          }
        // Also remove from session repo (disk)
        const list = await sessionRepo.list()
        const meta = list.find((m) => m.id === deleteSid)
        if (meta) { await sessionRepo.delete(meta) }
        await deleteContextSnapshot(DATA_DIR, deleteSid)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch (e) {
        console.error('[pi-server] failed to delete session:', e)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
    })()
    return
  }

  const m = url.pathname.match(/^\/session\/([^/]+)\/message$/)
  if (req.method !== 'POST' || !m) { res.writeHead(404); res.end('Not found'); return }

  const sessionId = m[1]

  let body = ''
  req.on('data', chunk => body += chunk)
  req.on('end', async () => {
    const wrapper = await getOrCreateWrapper(sessionId)
    if (!wrapper) { res.writeHead(404); res.end('Session not found'); return }
    const { content, images, providerID, modelID, apiKey, systemPrompt, thinkingLevel, workspaceDir, workspaceRoots, accessiblePaths, webSearchConfig, tools: mcpTools, allowedSseMcpToolNames, permissionMode, permissionRules, providerAPI, providerConfig: promptProviderConfig } = JSON.parse(body)
    console.log('[pi-server] session message — permissionMode:', permissionMode, 'permissionRules:', JSON.stringify(permissionRules))

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' })
    const emit = (event, data) => { try { res.write(createSSE(event, data)) } catch {} }

    try {
      const provider = providerID || 'anthropic'
      const modelId = modelID || 'claude-sonnet-4-20250514'
      console.log('[pi-server] Received prompt:', { provider, modelId, contentLen: content?.length })

      const effectiveProviderConfig = promptProviderConfig || (providerAPI ? { api: providerAPI } : {}) || runtimeConfig.providerConfig || {}
      const model = resolveModel(provider, modelId, effectiveProviderConfig)
      if (!model) {
        emit('error', { message: `Unknown model "${modelId}" for provider "${provider}". Click Settings → Fetch Models to see available models.` })
        emit('done', {}); res.end(); return
      }

      const ctx = wrapper.agent ? null : await wrapper.session.buildContext()
      const fullInitialMessages = ctx?.messages || []
      const initialMessages = restoreContextFromSnapshot(fullInitialMessages, wrapper.contextSnapshot)
      wrapper.persistedMessageCount = fullInitialMessages.length
      if (!wrapper.agent) {
        const { mcpToolDefs, tools } = createChatToolBundle({
          wrapper,
          sessionId,
          provider,
          modelId,
          apiKey,
          thinkingLevel,
          providerConfig: effectiveProviderConfig,
          workspaceDir,
          webSearchConfig,
          mcpTools,
          allowedSseMcpToolNames,
        })
        const sysPrompt = systemPrompt || 'You are a helpful assistant. Use the available tools when needed.'
        const fullPrompt = workspaceDir ? `${sysPrompt}\n\nWorkspace: ${workspaceDir}` : sysPrompt
        const contextEngine = createDefaultEngine(model, {
          contextLength: model?.contextLength,
          compressionCount: wrapper.contextSnapshot?.compressionCount || 0,
          lastTotalTokens: wrapper.contextSnapshot?.tokensAfter || 0,
        })
        wrapper.apiKey = apiKey

        const agent = new Agent({
          initialState: {
            systemPrompt: fullPrompt,
            model,
            tools,
            thinkingLevel: resolveThinkingLevel(model, thinkingLevel || 'medium'),
            messages: initialMessages,
          },
          sessionId,
          getApiKey: async () => wrapper.apiKey,
          transformContext: async (messages, signal) => {
            const activeContextEngine = wrapper.contextEngine || contextEngine
            const currentTokens = activeContextEngine.lastTotalTokens || calculateContextTokens(messages)
            if (!activeContextEngine.shouldCompress(currentTokens)) return messages
            const compressedMessages = await activeContextEngine.compress(messages, {
              model: agent.state.model,
              apiKey: wrapper.apiKey,
              onStatus: (s) => emit('status', s),
              signal,
            })
            if (compressedMessages !== messages && activeContextEngine.lastCompression) {
              const pendingMessageCount = Math.max(0, messages.length - (wrapper.previousMessageCount || 0))
              const snapshot = createContextSnapshot({
                sourceMessageCount: (wrapper.persistedMessageCount || 0) + pendingMessageCount,
                messages: compressedMessages,
                ...activeContextEngine.lastCompression,
              })
              await saveContextSnapshot(DATA_DIR, sessionId, snapshot)
              wrapper.contextSnapshot = snapshot
            }
            return compressedMessages
          },
          beforeToolCall: async ({ toolCall }) => {
            // Guard: prevent model from retrying tools that keep failing
            const guard = wrapper.toolGuard
            if (guard) {
              const guardResult = guard.beforeTool(toolCall.name, toolCall.arguments || {})
              if (guardResult?.block) {
                console.log('[pi-server] tool guard BLOCKING:', toolCall.name, guardResult.reason)
                wrapper.toolAudit?.decision(toolCall, {
                  outcome: 'deny',
                  risk: 'external',
                  source: 'builtin',
                  matchedRule: 'tool-guard',
                  resolvedTargets: [],
                  reason: guardResult.reason,
                })
                return { block: true, reason: guardResult.reason }
              }
            }

            const args = toolCall.arguments || {}
            emit('tool_call', { id: toolCall.id, name: toolCall.name, args: args })
            fireExtensionEvent('tool_call', { toolCallId: toolCall.id, toolName: toolCall.name, args }, { sessionId })
            return await authorizeToolCall(wrapper, toolCall, wrapper.config)
          },
          afterToolCall: async ({ result, toolCall }) => {
            wrapper.toolAudit?.finished(toolCall, result)
            if (toolCall?.name) {
              fireExtensionEvent('tool_result', { toolCallId: toolCall.id, toolName: toolCall.name, result }, { sessionId })
            }
            // Guard tracking: record tool outcome
            const guard = wrapper.toolGuard
            if (guard && toolCall?.name) {
              const isError = result?.isError === true
              const suffix = guard.afterTool(toolCall.name, toolCall.arguments || {}, isError)
              if (suffix && result?.content?.[0]?.type === 'text') {
                // Append the guard message to the tool result text
                const text = result.content[0].text || ''
                return { content: [{ type: 'text', text: text + suffix }] }
              }
            }

            // Structured error results for AI reasoning
            if (result?.isError && result?.content?.[0]?.type === 'text') {
              const raw = result.content[0].text || ''
              return { content: [{ type: 'text', text: JSON.stringify({ status: 'error', error: raw.slice(0, 300), hint: 'This tool call failed. Do NOT retry the same call. Diagnose the cause, then try a different approach.' }, null, 2) }] }
            }

            const truncated = truncateContent(result.content)
            if (truncated !== result.content) {
              return { content: truncated }
            }
            return undefined
          },
          toolExecution: 'parallel',
        })

        let pid = ''
        agent.subscribe((event) => {
          const e = sessions.get(sessionId)?.emit
          if (!e) return
          switch (event.type) {
            case 'message_update': {
              const ev = event.assistantMessageEvent
              if (ev?.type === 'text_delta') e('text_delta', { delta: ev.delta, pid })
              else if (ev?.type === 'thinking_delta') e('thinking_delta', { delta: ev.delta })
              break
            }
            case 'tool_execution_start': e('tool_execution_start', { id: event.toolCallId, name: event.toolName, args: event.args }); break
            case 'tool_execution_end': e('tool_execution_end', { id: event.toolCallId, name: event.toolName, result: event.result, isError: event.isError }); break
            case 'tool_execution_update': e('tool_execution_update', { id: event.toolCallId, name: event.toolName, partialResult: event.partialResult }); break
          }
        })

        wrapper.agent = agent
        wrapper.toolAudit = createToolAuditTracker(() => wrapper.auditContext)
        wrapper.contextEngine = contextEngine
        wrapper.previousMessageCount = initialMessages.length
        wrapper.toolGuard = new ToolGuard()
        wrapper.config = {
          workspaceDir,
          workspaceRoots: Array.isArray(workspaceRoots) ? workspaceRoots : [],
          accessiblePaths: Array.isArray(accessiblePaths) ? accessiblePaths : [],
          webSearchConfig,
          permissionMode,
          permissionRules,
          providerConfig: effectiveProviderConfig,
          mcpToolNames: new Set(mcpToolDefs.map((tool) => tool.name)),
          toolSecurity: buildToolSecurityIndex(tools),
        }
        sessions.set(sessionId, wrapper)
        console.log('[pi-server] Tools:', tools.length, '| Provider:', provider, '| Model:', modelId)
      } else {
        const sysPrompt = systemPrompt || 'You are a helpful assistant. Use the available tools when needed.'
        const fullPrompt = workspaceDir ? `${sysPrompt}\n\nWorkspace: ${workspaceDir}` : sysPrompt
        if (model) {
          wrapper.agent.state.model = model
          applyThinkingLevel(wrapper.agent, model, thinkingLevel || 'medium')
          wrapper.contextEngine = createDefaultEngine(model, {
            contextLength: model?.contextLength,
            compressionCount: wrapper.contextEngine?.compressionCount || wrapper.contextSnapshot?.compressionCount || 0,
            lastTotalTokens: wrapper.contextEngine?.lastTotalTokens || wrapper.contextSnapshot?.tokensAfter || 0,
          })
        }
        const { mcpToolDefs, tools } = createChatToolBundle({
          wrapper,
          sessionId,
          provider,
          modelId,
          apiKey: apiKey || wrapper.apiKey,
          thinkingLevel,
          providerConfig: effectiveProviderConfig,
          workspaceDir,
          webSearchConfig,
          mcpTools,
          allowedSseMcpToolNames,
        })
        wrapper.agent.state.tools = tools
        if (wrapper.agent.state.systemPrompt !== fullPrompt) wrapper.agent.state.systemPrompt = fullPrompt
        if (apiKey) wrapper.apiKey = apiKey
        wrapper.config = {
          workspaceDir,
          workspaceRoots: Array.isArray(workspaceRoots) ? workspaceRoots : [],
          accessiblePaths: Array.isArray(accessiblePaths) ? accessiblePaths : [],
          webSearchConfig,
          permissionMode,
          permissionRules,
          providerConfig: effectiveProviderConfig,
          mcpToolNames: new Set(mcpToolDefs.map((tool) => tool.name)),
          toolSecurity: buildToolSecurityIndex(tools),
        }
      }

      wrapper.auditContext = {
        surface: 'session',
        surfaceId: sessionId,
        runId: randomUUID(),
      }
      appendAuditEvent('run.started', {
        ...wrapper.auditContext,
        actor: 'chat-agent',
        outcome: 'running',
      })
      wrapper.emit = emit

      // ── Prompt with retry for transient network errors ──
      const totalAc = new AbortController()
      const totalTimeout = setTimeout(() => {
        totalAc.abort()
        console.log('[pi-server] Total timeout (120s) — stopping retries')
      }, 120_000)

      // Detect model vision capability: model.input.includes('image') means vision-capable
      const supportsVision = model?.input && Array.isArray(model.input) && model.input.includes('image')

      // Convert frontend images {data, mimeType}[] to ImageContent[] for pi-agent-core
      const imageContents = Array.isArray(images) && images.length > 0
        ? images.map(img => ({ type: 'image', data: img.data, mimeType: img.mimeType }))
        : undefined

      // If images provided but model doesn't support vision, drop them and warn
      const willUseImages = imageContents && supportsVision
      if (imageContents && !supportsVision) {
        console.log('[pi-server] Model does not support images, dropping', imageContents.length, 'image(s)')
        emit('status', { type: 'warning', message: `Model does not support image inputs — removing images.` })
      }

      try {
        const currentSessionId = sessionId
        fireExtensionEvent('agent_start', { sessionId: currentSessionId }, { sessionId: currentSessionId })
        await withRetry(
          () => willUseImages ? wrapper.agent.prompt(content, imageContents) : wrapper.agent.prompt(content),
          {
            maxRetries: 3,
            signal: totalAc.signal,
            onRetry: (status) => {
              console.log(
                `[pi-server] Retry ${status.attempt}/${status.maxRetries} ` +
                `after ${Math.round(status.delayMs / 1000)}s — ${status.error}`
              )
              emit('status', {
                type: 'retry',
                attempt: status.attempt,
                maxRetries: status.maxRetries,
                delayMs: status.delayMs,
                error: status.error,
              })
            },
          },
        )
        fireExtensionEvent('agent_end', { sessionId: currentSessionId }, { sessionId: currentSessionId })
      } finally {
        clearTimeout(totalTimeout)
        totalAc.abort()
      }

      const msgs = wrapper.agent.state.messages
      const last = [...msgs].reverse().find(m => m.role === 'assistant')

      // Debug: log content types for diagnostics
      if (last?.content) {
        const types = last.content.map(c => c.type).join(', ')
        console.log('[pi-server] Message content types:', types)
      }

      if (last?.usage) {
        wrapper.contextEngine.updateFromResponse(last.usage)
      }
      try {
        await persistAgentMessages(wrapper)
      } catch (persistErr) {
        console.error('[pi-server] failed to persist session messages:', persistErr)
      }

      // Robust text extraction — supports both plain text and extended thinking modes
      const text = extractAssistantText(last)

      emit('result', { text: text || '' })
      emit('done', {})
      appendAuditEvent('run.completed', {
        ...wrapper.auditContext,
        actor: 'chat-agent',
        outcome: 'completed',
      })
    } catch (err) {
      console.error('[pi-server] prompt failed:', err.message, err.stack?.slice(0, 300))
      const userMsg = err.message === 'Request was aborted'
        ? 'Request was aborted — this usually means the AI provider connection was interrupted. Check your network and API key configuration.'
        : (err.message || String(err))
      try { emit('error', { message: userMsg }); emit('done', {}) } catch {}
      if (wrapper?.auditContext) {
        appendAuditEvent('run.failed', {
          ...wrapper.auditContext,
          actor: 'chat-agent',
          outcome: 'failed',
          details: { error: err?.message || String(err) },
        })
      }
    }
    if (wrapper) wrapper.emit = null
    try { res.end() } catch {}
  })
}).listen(PORT, '127.0.0.1', () => {
  const sLoopDir = process.env.S_LOOP_PROJECT_DIR || process.env.SNOTRA_PROJECT_DIR || process.cwd()
  initAuditStore(sLoopDir)
  initApprovalStore(sLoopDir)

  // Detect parent process exit via stdin pipe close (works on all platforms)
  if (process.stdin) {
    process.stdin.on('end', () => {
      console.log('[pi-server] parent process exited, shutting down')
      process.exit(0)
    })
    process.stdin.resume()
  }

  // Initialize and start task scheduler
  initPlatformCenter(sLoopDir)
  initPlatformRunStore(sLoopDir)
  initTelegramMonitor(sLoopDir)
  initTelegramChatSync(sLoopDir)
  initTasks(sLoopDir)
  initGoalPersistence(sLoopDir)
  console.log(`[pi-server] listening on http://127.0.0.1:${PORT}`)
  startTicker({
    projectDir: sLoopDir,
    apiKey: process.env.PI_API_KEY || '',
    defaultProvider: 'anthropic',
    defaultModel: 'claude-sonnet-4-20250514',
    prompt: createCronPrompt,
    runtimeConfig,
  })
  void ensureTelegramMonitorState()
  // Load installed pi.dev extensions
  initExtensions().catch((err) => {
    console.error('[pi-server] extension init error:', err)
  })
})
