import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { Agent } from '@earendil-works/pi-agent-core'
import { getModel, getModels } from '@earendil-works/pi-ai'
import { createCodingTools, createReadOnlyTools } from '@earendil-works/pi-coding-agent'
import { webSearch, fetchUrl } from './searchProviders.mjs'
import { init as initTasks, loadTasks, getTask, createTask, updateTask, removeTask, getTaskOutputs, runTask, startTicker } from './task-scheduler.mjs'

const PORT = parseInt(process.env.PI_SERVER_PORT || '4096')
const sessions = new Map()

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
      description: `Search the web for current information (provider: ${providerName}). Returns results with real source URLs, titles, and snippets. Use web_fetch to read full page content from any interesting URL.`,
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'Search query' } }, required: ['query'] },
      execute: async (_id, params) => {
        const result = await webSearch(params.query, webSearchConfig)
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

// ── Cron prompt helper (shared by ticker and HTTP handler) ──
const createCronPrompt = async (content, options) => {
  try {
    const model = getModel(options.providerID, options.modelID)
    if (!model) return { text: '', error: 'Model not found' }
    const agent = new Agent({
      initialState: {
        systemPrompt: options.systemPrompt || 'You are a helpful assistant.',
        model,
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
          projectDir: params.projectDir || process.cwd(),
          apiKey: task.apiKey || params.apiKey || '',
          defaultProvider: params.defaultProvider || 'anthropic',
          defaultModel: params.defaultModel || 'claude-sonnet-4-20250514',
          prompt: createCronPrompt,
          makeSession: true,
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
    res.end(JSON.stringify({ healthy: true })); return
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
      let text = ''
      if (last?.content) {
        text = last.content.find(c => c.type === 'text')?.text || ''
        if (!text) text = last.content.find(c => c.type === 'thinking')?.text || ''
        if (!text) {
          for (const c of last.content) {
            if (typeof c.text === 'string' && c.text) { text = c.text; break }
          }
        }
      }
      if (!text && last?.errorMessage) text = `Error: ${last.errorMessage}`

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

  // Initialize and start task scheduler
  const snotraDir = process.env.SNOTRA_PROJECT_DIR || process.cwd()
  initTasks(snotraDir)
  startTicker({
    projectDir: snotraDir,
    apiKey: process.env.PI_API_KEY || '',
    defaultProvider: 'anthropic',
    defaultModel: 'claude-sonnet-4-20250514',
    prompt: createCronPrompt,
  })
})
