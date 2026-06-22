import { createServer } from 'node:http'
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { Agent } from '@earendil-works/pi-agent-core'
import { getModel, getModels } from '@earendil-works/pi-ai'
import { createCodingTools, createReadOnlyTools } from '@earendil-works/pi-coding-agent'
import { webSearch, fetchUrl } from './searchProviders.mjs'
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

const PORT = parseInt(process.env.PI_SERVER_PORT || '4096')
const sessions = new Map()
const inboundSeen = new Map()
const runtimeConfig = {
  providerID: 'anthropic',
  modelID: 'claude-sonnet-4-20250514',
  apiKey: process.env.PI_API_KEY || '',
  workspaceDir: undefined,
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
      description: `Search the web and return results with URLs, titles, and snippets.

CRITICAL RULE: The query must be one continuous, natural phrase — no space-separated keywords. Instead of "塞尔达传说时之笛 最新资讯 2024", write "塞尔达传说时之笛最新资讯". Never split Chinese text into individual words or characters.`,
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'One continuous phrase — no spaces between Chinese words, no standalone dates or keywords. Write like natural human writing.' } }, required: ['query'] },
      execute: async (_id, params) => {
        const query = params.query
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
  return tools
}

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
  const model = getModel(provider, modelId)
  if (!model) {
    throw new Error(`Unknown model "${modelId}" for provider "${provider}"`)
  }

  let wrapper = sessions.get(sessionId)
  if (!wrapper) {
    const cwd = runtimeConfig.workspaceDir || process.cwd()
    const tools = getTools(cwd)
    const agent = new Agent({
      initialState: {
        systemPrompt: 'You are a helpful assistant. Keep external platform replies concise and readable.',
        model,
        tools,
        thinkingLevel: 'off',
      },
      sessionId,
      getApiKey: async () => runtimeConfig.apiKey || '',
      toolExecution: 'parallel',
    })
    wrapper = { agent, emit: null }
    sessions.set(sessionId, wrapper)
  } else {
    wrapper.agent.state.model = model
    wrapper.agent.state.tools = getTools(runtimeConfig.workspaceDir || process.cwd())
  }

  const promptPromise = wrapper.agent.prompt(content)
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Platform conversation timed out')), 120_000)
  })
  await Promise.race([promptPromise, timeoutPromise])
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
    const model = getModel(options.providerID, options.modelID)
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

  if (req.method === 'GET' && url.pathname === '/models') {
    const provider = url.searchParams.get('provider') || 'anthropic'
    try { const list = getModels(provider).map(m => ({ id: m.id, name: m.name })); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(list)) }
    catch { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify([])) }
    return
  }

  if (req.method === 'POST' && url.pathname === '/session') {
    const id = randomUUID()
    sessions.set(id, null)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ id })); return
  }

  const m = url.pathname.match(/^\/session\/([^/]+)\/message$/)
  if (req.method !== 'POST' || !m) { res.writeHead(404); res.end('Not found'); return }

  const sessionId = m[1]
  let wrapper = sessions.get(sessionId)
  if (wrapper === undefined) { res.writeHead(404); res.end('Session not found'); return }

  let body = ''
  req.on('data', chunk => body += chunk)
  req.on('end', async () => {
    const { content, providerID, modelID, apiKey, systemPrompt, thinkingLevel, workspaceDir, webSearchConfig } = JSON.parse(body)

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' })
    const emit = (event, data) => { try { res.write(createSSE(event, data)) } catch {} }

    try {
      const provider = providerID || 'anthropic'
      const modelId = modelID || 'claude-sonnet-4-20250514'
      console.log('[pi-server] Received prompt:', { provider, modelId, contentLen: content?.length })

      const model = getModel(provider, modelId)
      if (!model) {
        emit('error', { message: `Unknown model "${modelId}" for provider "${provider}". Click Settings → Fetch Models to see available models.` })
        emit('done', {}); res.end(); return
      }

      if (!wrapper) {
        const cwd = workspaceDir || process.cwd()
        const tools = getTools(cwd, webSearchConfig)
        const sysPrompt = systemPrompt || 'You are a helpful assistant. Use the available tools when needed.'
        const fullPrompt = workspaceDir ? `${sysPrompt}\n\nWorkspace: ${workspaceDir}` : sysPrompt

        const agent = new Agent({
          initialState: {
            systemPrompt: fullPrompt,
            model,
            tools,
            thinkingLevel: model.reasoning && thinkingLevel !== 'off' ? (thinkingLevel || 'medium') : 'off',
          },
          sessionId,
          getApiKey: async () => apiKey,
          beforeToolCall: async ({ toolCall }) => {
            emit('tool_call', { id: toolCall.id, name: toolCall.name, args: toolCall.arguments || {} })
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
          }
        })

        wrapper = { agent, emit: null }
        sessions.set(sessionId, wrapper)
        console.log('[pi-server] Tools:', tools.length, '| Provider:', provider, '| Model:', modelId)
      } else {
        if (model) wrapper.agent.state.model = model
        wrapper.agent.state.tools = getTools(workspaceDir || process.cwd(), webSearchConfig)
      }

      wrapper.emit = emit
      const ac = new AbortController()
      const promptPromise = wrapper.agent.prompt(content)
      const timeout = setTimeout(() => { ac.abort(); wrapper.agent.abort(); console.log('[pi-server] Timed out') }, 120_000)
      try { await promptPromise } finally { clearTimeout(timeout) }

      const msgs = wrapper.agent.state.messages
      const last = [...msgs].reverse().find(m => m.role === 'assistant')

      // Debug: log content types for diagnostics
      if (last?.content) {
        const types = last.content.map(c => c.type).join(', ')
        console.log('[pi-server] Message content types:', types)
      }

      // Robust text extraction — supports both plain text and extended thinking modes
      const text = extractAssistantText(last)

      emit('result', { text: text || '' })
      emit('done', {})
    } catch (err) {
      try { emit('error', { message: err.message || String(err) }); emit('done', {}) } catch {}
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
