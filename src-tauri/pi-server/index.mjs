import { createServer } from 'node:http'
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { Agent } from '@earendil-works/pi-agent-core'
import { getModel, getModels } from '@earendil-works/pi-ai'
import { createCodingTools, createReadOnlyTools } from '@earendil-works/pi-coding-agent'
import { webSearch, fetchUrl } from './searchProviders.mjs'
import { createDefaultEngine, calculateContextTokens, truncateContent } from './context-engine/index.mjs'
import { createSessionRepo, findSession } from './session-store.mjs'
import { init as initTasks, loadTasks, getTask, createTask, updateTask, removeTask, getTaskOutputs, runTask, startTicker } from './task-scheduler.mjs'
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

const PORT = parseInt(process.env.PI_SERVER_PORT || '4096')
const DATA_DIR = process.env.S_LOOP_PROJECT_DIR || process.env.SNOTRA_PROJECT_DIR || process.cwd()
const sessionRepo = createSessionRepo(DATA_DIR)
const sessions = new Map()
const inboundSeen = new Map()
const runtimeConfig = {
  providerID: 'anthropic',
  modelID: 'claude-sonnet-4-20250514',
  apiKey: process.env.PI_API_KEY || '',
  workspaceDir: undefined,
  providerConfig: {},
}

function createCustomModel(providerID, modelID, providerConfig = {}) {
  const api = providerConfig.api || 'openai-completions'
  const baseUrl = providerConfig.baseUrl || ''
  return {
    id: modelID,
    name: modelID,
    api,
    provider: providerID,
    baseUrl,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    contextLength: 128000,
    maxTokens: 4096,
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

function getTools(dir, webSearchConfig) {
  const all = [...createCodingTools(dir), ...createReadOnlyTools(dir)]
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
          workspaceDir: runtimeConfig.workspaceDir,
          webSearchConfig: wrapper?.config?.webSearchConfig,
          providerConfig: runtimeConfig.providerConfig,
        },
        resolveModel,
        getTools,
        signal,
        projectDir: projectDir || runtimeConfig.workspaceDir,
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
          agent: result.agent,
          exitCode: result.exitCode,
          usage: result.usage,
          model: result.model,
          stopReason: result.stopReason,
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
          workspaceDir: runtimeConfig.workspaceDir,
          webSearchConfig: wrapper?.config?.webSearchConfig,
          providerConfig: runtimeConfig.providerConfig,
        },
        resolveModel,
        getTools,
        signal,
        projectDir: projectDir || runtimeConfig.workspaceDir,
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

function getSubagentList(projectDir) {
  const { agents, builtinDir, userDir } = discoverAgents(projectDir)
  return agents.map((a) => ({
    name: a.name,
    description: a.description,
    model: a.model,
    tools: a.tools,
    source: a.source,
    maxTurns: a.maxTurns,
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
    wrapper = { session, agent: null, emit: null, contextEngine: null, apiKey: '', config: {}, mcpToolRequests: new Map() }
    sessions.set(sessionId, wrapper)
    return wrapper
  }

  if (!autoCreate) return null

  const session = await sessionRepo.create({ cwd: DATA_DIR, id: sessionId })
  wrapper = { session, agent: null, emit: null, contextEngine: null, apiKey: '', config: {}, mcpToolRequests: new Map() }
  sessions.set(sessionId, wrapper)
  return wrapper
}

async function persistAgentMessages(wrapper) {
  if (!wrapper?.agent || !wrapper?.session) return
  const previousCount = wrapper.previousMessageCount || 0
  const messages = wrapper.agent.state.messages.slice(previousCount)
  for (const message of messages) {
    await wrapper.session.appendMessage(message)
  }
  wrapper.previousMessageCount = wrapper.agent.state.messages.length
}

function createMcpToolDefinition(tool, wrapper, sessionId) {
  return {
    name: tool.name,
    label: `${tool.serverName}/${tool.name}`,
    description: tool.description || `MCP tool ${tool.name}`,
    parameters: tool.inputSchema || { type: 'object', properties: {} },
    executionMode: 'parallel',
    execute: async (_toolCallId, params, signal) => callMcpTool(wrapper, sessionId, tool.serverName, tool.name, params, signal),
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

const DANGEROUS_CATEGORIES = new Set(['bash', 'edit', 'write', 'delete', 'remove', 'execute', 'shell'])

function getToolCategory(toolName) {
  const lower = toolName.toLowerCase()
  if (lower.includes('bash') || lower.includes('shell') || lower.includes('exec')) return 'bash'
  if (lower.includes('edit') || lower.includes('write') || lower.includes('delete') || lower.includes('remove')) return 'edit'
  if (lower.includes('grep')) return 'grep'
  if (lower.includes('find') || lower.includes('glob')) return 'glob'
  if (lower.includes('ls') || lower.includes('list')) return 'list'
  if (lower.includes('web_search')) return 'websearch'
  if (lower.includes('web_fetch')) return 'webfetch'
  if (lower.includes('read')) return 'read'
  if (lower.includes('skill')) return 'skill'
  return toolName
}

function checkToolPermission(toolName, rules = {}, mode = 'ask') {
  console.log('[pi-server] checkToolPermission:', { toolName, mode, rules })
  if (mode === 'allow') return { allowed: true }
  if (mode === 'deny') return { allowed: false, reason: 'Permission denied: agent policy is deny-all' }
  const category = getToolCategory(toolName)
  const action = rules[toolName] ?? rules[category]
  console.log('[pi-server] checkToolPermission category:', category, 'action:', action, 'isDangerous:', DANGEROUS_CATEGORIES.has(category))
  if (action === 'deny') return { allowed: false, reason: `Permission denied: ${toolName} is blocked by agent rules` }
  if (action === 'allow') return { allowed: true }
  if (DANGEROUS_CATEGORIES.has(category)) return { allowed: false, reason: `Permission denied: ${toolName} requires explicit approval` }
  return { allowed: true }
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
  if (platformId === 'feishu') {
    if (payload.challenge) {
      return { challenge: payload.challenge }
    }
    const event = payload.event || {}
    const message = event.message || {}
    const sender = event.sender || {}
    let text = ''
    if (typeof message.content === 'string') {
      try {
        const parsed = JSON.parse(message.content)
        text = parsed?.text || parsed?.content || ''
      } catch {
        text = message.content
      }
    }
    if (!text?.trim()) return null
    const chatId = String(message.chat_id || event.open_chat_id || event.chat_id || '')
    return {
      platformId,
      conversationId: String(message.chat_id || event.open_chat_id || event.chat_id || sender.sender_id?.open_id || sender.sender_id?.union_id || ''),
      chatId,
      threadId: message.thread_id || null,
      messageId: message.message_id || payload.header?.event_id || Date.now(),
      text: text.trim(),
      username: sender.sender_id?.open_id || sender.sender_id?.union_id || '',
    }
  }

  if (platformId === 'dingtalk') {
    if (payload.challenge) {
      return { challenge: payload.challenge }
    }
    const text = payload.text?.content || payload.content?.text || payload.message?.text?.content || payload.text
    if (!String(text || '').trim()) return null
    const conversationId = String(payload.conversationId || payload.chatbotConversationId || payload.sessionWebhook || payload.senderStaffId || '')
    return {
      platformId,
      conversationId,
      chatId: conversationId,
      threadId: null,
      messageId: payload.msgId || payload.messageId || Date.now(),
      text: String(text).trim(),
      username: payload.senderNick || payload.senderStaffId || '',
    }
  }

  if (platformId === 'wechat') {
    const text = payload.text?.content || payload.content || payload.message?.content || payload.msg || ''
    if (!String(text || '').trim()) return null
    const conversationId = String(payload.chatid || payload.roomid || payload.from?.id || payload.sender || '')
    return {
      platformId,
      conversationId,
      chatId: conversationId,
      threadId: null,
      messageId: payload.msgid || payload.messageId || Date.now(),
      text: String(text).trim(),
      username: payload.from?.name || payload.sender || '',
    }
  }

  return null
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8')
  const b = Buffer.from(String(right || ''), 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function verifyPlatformInbound(platformId, rawBody, payload, headers) {
  const platform = getPlatformConfig(platformId)
  if (!platform?.connected) {
    return { ok: false, error: `${platform?.name || platformId} 未连接` }
  }

  if (platformId === 'feishu') {
    const verificationToken = platform.values.verificationToken?.trim()
    const encryptKey = platform.values.encryptKey?.trim()
    const payloadToken = payload?.header?.token || payload?.token || ''
    if (verificationToken && !constantTimeEqual(payloadToken, verificationToken)) {
      return { ok: false, error: '飞书 token 校验失败' }
    }
    const signature = headers['x-lark-signature']
    const timestamp = headers['x-lark-request-timestamp']
    const nonce = headers['x-lark-request-nonce']
    if (encryptKey && signature && timestamp && nonce) {
      const expected = createHash('sha256')
        .update(`${timestamp}${nonce}${encryptKey}${rawBody}`, 'utf8')
        .digest('hex')
      if (!constantTimeEqual(signature, expected)) {
        return { ok: false, error: '飞书签名校验失败' }
      }
    }
    return { ok: true }
  }

  if (platformId === 'dingtalk') {
    const inboundToken = platform.values.inboundToken?.trim()
    const payloadToken = payload?.token || payload?.headers?.token || ''
    if (inboundToken && !constantTimeEqual(payloadToken, inboundToken)) {
      return { ok: false, error: '钉钉 token 校验失败' }
    }
    return { ok: true }
  }

  if (platformId === 'wechat') {
    const inboundToken = platform.values.inboundToken?.trim()
    const payloadToken = payload?.token || payload?.headers?.token || ''
    if (inboundToken && !constantTimeEqual(payloadToken, inboundToken)) {
      return { ok: false, error: '企业微信 token 校验失败' }
    }
    return { ok: true }
  }

  return { ok: true }
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

async function promptPlatformConversation(sessionId, content) {
  const provider = runtimeConfig.providerID || 'anthropic'
  const modelId = runtimeConfig.modelID || 'claude-sonnet-4-20250514'
  const model = resolveModel(provider, modelId, runtimeConfig.providerConfig)
  if (!model) {
    throw new Error(`Unknown model "${modelId}" for provider "${provider}"`)
  }

  const wrapper = await getOrCreateWrapper(sessionId, true)
  const ctx = wrapper.agent ? null : await wrapper.session.buildContext()
  const initialMessages = ctx?.messages || []
  if (!wrapper.agent) {
    const cwd = runtimeConfig.workspaceDir || process.cwd()
    const tools = getTools(cwd)
    wrapper.agent = new Agent({
      initialState: {
        systemPrompt: 'You are a helpful assistant. Keep external platform replies concise and readable.',
        model,
        tools,
        thinkingLevel: 'off',
        messages: initialMessages,
      },
      sessionId,
      getApiKey: async () => runtimeConfig.apiKey || '',
      toolExecution: 'parallel',
    })
    wrapper.previousMessageCount = initialMessages.length
  } else {
    wrapper.agent.state.model = model
    wrapper.agent.state.tools = getTools(runtimeConfig.workspaceDir || process.cwd())
  }

  const promptPromise = wrapper.agent.prompt(content)
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Platform conversation timed out')), 120_000)
  })
  await Promise.race([promptPromise, timeoutPromise])
  try {
    await persistAgentMessages(wrapper)
  } catch (persistErr) {
    console.error('[pi-server] failed to persist platform session messages:', persistErr)
  }
  const last = [...wrapper.agent.state.messages].reverse().find((message) => message.role === 'assistant')
  return extractAssistantText(last)
}

async function processPlatformInbound(platformId, incoming, options = {}) {
  recordPlatformMessage(platformId, 'received', incoming.text)
  recordPlatformInbound(incoming)
  const sessionId = `${platformId}:${incoming.conversationId}`
  try {
    const reply = await promptPlatformConversation(sessionId, incoming.text)
    if (!reply.trim()) return { ok: true, replied: false }
    await sendPlatformMessage(platformId, reply, options.sendOptions || {})
    recordPlatformOutbound({
      ...incoming,
      text: reply,
      replyKey: incoming.messageId,
    })
    return { ok: true, replied: true }
  } catch (err) {
    console.error(`[pi-server] ${platformId} inbound failed:`, err)
    const fallback = `S-Loop 处理消息失败：${err?.message || String(err)}`
    await sendPlatformMessage(platformId, fallback, options.sendOptions || {}).catch(() => {})
    recordPlatformOutbound({
      ...incoming,
      text: fallback,
      replyKey: `${incoming.messageId}:error`,
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
    const tools = getTools(cwd, options.webSearchConfig)
    const sysPrompt = options.systemPrompt || 'You are a helpful assistant.'
    const fullPrompt = options.workspaceDir ? `${sysPrompt}\n\nWorkspace: ${options.workspaceDir}` : sysPrompt
    const agent = new Agent({
      initialState: {
        systemPrompt: fullPrompt,
        model,
        tools,
        thinkingLevel: 'off',
      },
      sessionId: options.sessionId || 'cron-' + Date.now(),
      getApiKey: async () => options.apiKey || process.env.PI_API_KEY || '',
      toolExecution: 'parallel',
    })
    await agent.prompt(content)
    const msgs = agent.state.messages
    const last = [...msgs].reverse().find(m => m.role === 'assistant')
    const text = last?.content?.find?.(c => c.type === 'text')?.text || last?.content?.find?.(c => c.type === 'thinking')?.text || ''
    return { text: text || '' }
  } catch (err) {
    return { text: '', error: err.message }
  }
}

// ── Server ───────────────────────────────────────────────

createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  if (req.method === 'POST' && url.pathname === '/runtime/config') {
    readJsonBody(req).then((data) => {
      runtimeConfig.providerID = data.providerID || runtimeConfig.providerID
      runtimeConfig.modelID = data.modelID || runtimeConfig.modelID
      runtimeConfig.apiKey = data.apiKey ?? runtimeConfig.apiKey
      runtimeConfig.workspaceDir = data.workspaceDir || undefined
      if (data.providerConfig) runtimeConfig.providerConfig = data.providerConfig
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    }).catch((e) => {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    })
    return
  }

  if (req.method === 'GET' && url.pathname === '/platforms/chat-sync') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(getPlatformChatSyncSnapshot()))
    return
  }

  const platformInboundMatch = url.pathname.match(/^\/platforms\/inbound\/(feishu|dingtalk|wechat)$/)
  if (req.method === 'POST' && platformInboundMatch) {
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
        const result = await runTask(task, {
          projectDir: params.projectDir || task.workspaceDir || process.cwd(),
          apiKey: task.apiKey || params.apiKey || '',
          defaultProvider: params.defaultProvider || 'anthropic',
          defaultModel: params.defaultModel || 'claude-sonnet-4-20250514',
          prompt: createCronPrompt,
          makeSession: true,
          trigger: 'manual',
        })
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
      let list = []
      try {
        const builtIn = getModels(provider).map(m => ({ id: m.id, name: m.name }))
        if (builtIn.length > 0) {
          list = builtIn
        } else if (baseUrl) {
          list = await fetchOpenAiCompatibleModels(baseUrl, apiKey)
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

  if (req.method === 'POST' && url.pathname === '/session') {
    (async () => {
      const id = randomUUID()
      const session = await sessionRepo.create({ cwd: DATA_DIR, id })
      const metadata = await session.getMetadata()
      sessions.set(metadata.id, { session, agent: null, emit: null, contextEngine: null, apiKey: '', config: {}, mcpToolRequests: new Map() })
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

  const abortMatch = url.pathname.match(/^\/session\/([^/]+)\/abort$/)
  if (req.method === 'POST' && abortMatch) {
    const abortSessionId = abortMatch[1]
    const abortWrapper = sessions.get(abortSessionId)
    if (abortWrapper?.agent) {
      console.log('[pi-server] explicit abort for session:', abortSessionId)
      try { abortWrapper.agent.abort() } catch (e) { console.warn('[pi-server] abort error:', e.message) }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
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
    const { content, providerID, modelID, apiKey, systemPrompt, thinkingLevel, workspaceDir, webSearchConfig, tools: mcpTools, permissionMode, permissionRules, providerAPI, providerConfig: promptProviderConfig } = JSON.parse(body)
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
      const initialMessages = ctx?.messages || []
      if (!wrapper.agent) {
        const cwd = workspaceDir || process.cwd()
        const baseTools = getTools(cwd, webSearchConfig)
        const mcpToolDefs = Array.isArray(mcpTools)
          ? mcpTools.map((t) => createMcpToolDefinition(t, wrapper, sessionId))
          : []
        const tools = [...baseTools, ...mcpToolDefs,
          createDelegateTaskTool({ runtimeConfig: { ...runtimeConfig, apiKey }, resolveModel, getTools, projectDir: workspaceDir || DATA_DIR, emit, wrapper }),
          createDelegateParallelTool({ runtimeConfig: { ...runtimeConfig, apiKey }, resolveModel, getTools, projectDir: workspaceDir || DATA_DIR, emit, wrapper }),
        ]
        const sysPrompt = systemPrompt || 'You are a helpful assistant. Use the available tools when needed.'
        const fullPrompt = workspaceDir ? `${sysPrompt}\n\nWorkspace: ${workspaceDir}` : sysPrompt
        const contextEngine = createDefaultEngine(model, { contextLength: model?.contextLength })
        wrapper.apiKey = apiKey

        const agent = new Agent({
          initialState: {
            systemPrompt: fullPrompt,
            model,
            tools,
            thinkingLevel: model.reasoning && thinkingLevel !== 'off' ? (thinkingLevel || 'medium') : 'off',
            messages: initialMessages,
          },
          sessionId,
          getApiKey: async () => wrapper.apiKey,
          transformContext: async (messages, signal) => {
            const currentTokens = contextEngine.lastTotalTokens || calculateContextTokens(messages)
            if (!contextEngine.shouldCompress(currentTokens)) return messages
            return await contextEngine.compress(messages, {
              model: agent.state.model,
              apiKey: wrapper.apiKey,
              onStatus: (s) => emit('status', s),
            })
          },
          beforeToolCall: async ({ toolCall }) => {
            emit('tool_call', { id: toolCall.id, name: toolCall.name, args: toolCall.arguments || {} })
            console.log('[pi-server] beforeToolCall:', toolCall.name, 'config.mode:', wrapper.config?.permissionMode, 'config.rules:', JSON.stringify(wrapper.config?.permissionRules || {}))
            const permission = checkToolPermission(toolCall.name, wrapper.config?.permissionRules, wrapper.config?.permissionMode)
            console.log('[pi-server] beforeToolCall result:', JSON.stringify(permission))
            if (!permission.allowed) {
              console.log('[pi-server] BLOCKING tool:', toolCall.name, 'reason:', permission.reason)
              return { block: true, reason: permission.reason }
            }
            return undefined
          },
          afterToolCall: async ({ result }) => {
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
        wrapper.contextEngine = contextEngine
        wrapper.previousMessageCount = initialMessages.length
        wrapper.config = { workspaceDir, webSearchConfig, permissionMode, permissionRules, providerConfig: effectiveProviderConfig }
        sessions.set(sessionId, wrapper)
        console.log('[pi-server] Tools:', tools.length, '| Provider:', provider, '| Model:', modelId)
      } else {
        const sysPrompt = systemPrompt || 'You are a helpful assistant. Use the available tools when needed.'
        const fullPrompt = workspaceDir ? `${sysPrompt}\n\nWorkspace: ${workspaceDir}` : sysPrompt
        if (model) wrapper.agent.state.model = model
        const baseTools = getTools(workspaceDir || process.cwd(), webSearchConfig)
        const mcpToolDefs = Array.isArray(mcpTools)
          ? mcpTools.map((t) => createMcpToolDefinition(t, wrapper, sessionId))
          : []
        wrapper.agent.state.tools = [...baseTools, ...mcpToolDefs]
        if (wrapper.agent.state.systemPrompt !== fullPrompt) wrapper.agent.state.systemPrompt = fullPrompt
        if (apiKey) wrapper.apiKey = apiKey
        wrapper.config = { workspaceDir, webSearchConfig, permissionMode, permissionRules, providerConfig: effectiveProviderConfig }
      }

      wrapper.emit = emit

      // ── Prompt with retry for transient network errors ──
      const totalAc = new AbortController()
      const totalTimeout = setTimeout(() => {
        totalAc.abort()
        console.log('[pi-server] Total timeout (120s) — stopping retries')
      }, 120_000)

      try {
        await withRetry(
          () => wrapper.agent.prompt(content),
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
    } catch (err) {
      console.error('[pi-server] prompt failed:', err.message, err.stack?.slice(0, 300))
      const userMsg = err.message === 'Request was aborted'
        ? 'Request was aborted — this usually means the AI provider connection was interrupted. Check your network and API key configuration.'
        : (err.message || String(err))
      try { emit('error', { message: userMsg }); emit('done', {}) } catch {}
    }
    if (wrapper) wrapper.emit = null
    try { res.end() } catch {}
  })
}).listen(PORT, '127.0.0.1', () => {
  console.log(`[pi-server] listening on http://127.0.0.1:${PORT}`)

  // Detect parent process exit via stdin pipe close (works on all platforms)
  if (process.stdin) {
    process.stdin.on('end', () => {
      console.log('[pi-server] parent process exited, shutting down')
      process.exit(0)
    })
    process.stdin.resume()
  }

  // Initialize and start task scheduler
  const sLoopDir = process.env.S_LOOP_PROJECT_DIR || process.env.SNOTRA_PROJECT_DIR || process.cwd()
  initPlatformCenter(sLoopDir)
  initTelegramMonitor(sLoopDir)
  initTelegramChatSync(sLoopDir)
  initTasks(sLoopDir)
  startTicker({
    projectDir: sLoopDir,
    apiKey: process.env.PI_API_KEY || '',
    defaultProvider: 'anthropic',
    defaultModel: 'claude-sonnet-4-20250514',
    prompt: createCronPrompt,
  })
  void ensureTelegramMonitorState()
})
