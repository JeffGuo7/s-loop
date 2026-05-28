import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { Agent } from '@earendil-works/pi-agent-core'
import { getModel, getModels } from '@earendil-works/pi-ai'
import { createCodingTools, createReadOnlyTools } from '@earendil-works/pi-coding-agent'

const PORT = parseInt(process.env.PI_SERVER_PORT || '4096')
const sessions = new Map()

function createSSE(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function getTools(dir) {
  const all = [...createCodingTools(dir), ...createReadOnlyTools(dir)]
  const seen = new Set()
  const tools = all.filter(t => { if (seen.has(t.name)) return false; seen.add(t.name); return true })
  if (!seen.has('web_search')) {
    tools.push({
      name: 'web_search', label: 'Web Search',
      description: 'Search the web for current information.',
      parameters: { type: 'object', properties: { query: { type: 'string', description: 'Search query' } }, required: ['query'] },
      execute: async (_id, params) => {
        try {
          const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(params.query)}`
          const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) })
          const html = await res.text()
          const results = []
          const r = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>.*?<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([^<]*)</gs
          let m
          while ((m = r.exec(html)) !== null && results.length < 5) {
            results.push({ title: m[2].replace(/<[^>]+>/g, '').trim(), url: m[1], snippet: m[3].replace(/<[^>]+>/g, '').trim() })
          }
          return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }], details: {} }
        } catch (e) {
          return { content: [{ type: 'text', text: `Search failed: ${e.message}` }], details: {} }
        }
      },
    })
  }
  return tools
}

process.on('uncaughtException', (err) => console.error('[pi-server] UNCAUGHT:', err))
process.on('unhandledRejection', (err) => console.error('[pi-server] UNHANDLED:', err))

createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

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
    const { content, providerID, modelID, apiKey, systemPrompt, thinkingLevel, workspaceDir } = JSON.parse(body)

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' })
    const emit = (event, data) => { try { res.write(createSSE(event, data)) } catch {} }

    try {
      const provider = providerID || 'anthropic'
      const modelId = modelID || 'claude-sonnet-4-20250514'

      const model = getModel(provider, modelId)
      if (!model) {
        emit('error', { message: `Unknown model "${modelId}" for provider "${provider}". Click Settings → Fetch Models to see available models.` })
        emit('done', {}); res.end(); return
      }

      if (!wrapper) {
        const cwd = workspaceDir || process.cwd()
        const tools = getTools(cwd)
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
        wrapper.agent.state.tools = getTools(workspaceDir || process.cwd())
      }

      wrapper.emit = emit
      const ac = new AbortController()
      const promptPromise = wrapper.agent.prompt(content)
      const timeout = setTimeout(() => { ac.abort(); wrapper.agent.abort(); console.log('[pi-server] Timed out') }, 120_000)
      try { await promptPromise } finally { clearTimeout(timeout) }

      const msgs = wrapper.agent.state.messages
      const last = [...msgs].reverse().find(m => m.role === 'assistant')
      const text = last?.content?.find?.(c => c.type === 'text')?.text || (last?.errorMessage ? `Error: ${last.errorMessage}` : '')

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
})
