import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { getModel } from '@earendil-works/pi-ai'
import { createAgentSession, createCodingTools, createReadOnlyTools, AuthStorage } from '@earendil-works/pi-coding-agent'

const PORT = parseInt(process.env.PI_SERVER_PORT || '4096')
const sessions = new Map()

function createSSE(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function getTools(dir) {
  const all = [...createCodingTools(dir), ...createReadOnlyTools(dir)]
  const seen = new Set()
  return all.filter(t => { if (seen.has(t.name)) return false; seen.add(t.name); return true })
}

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
      const cwd = workspaceDir || process.cwd()

      if (!wrapper) {
        // First message: create session like openclaw
const authStorage = AuthStorage.inMemory()
          if (apiKey) authStorage.runtimeOverrides.set(provider, apiKey)

        const sysPrompt = systemPrompt || 'You are a helpful assistant. Use the available tools when needed.'
        const fullPrompt = workspaceDir ? `${sysPrompt}\n\nWorkspace: ${workspaceDir}` : sysPrompt

        const created = await createAgentSession({
          cwd,
          model: getModel(provider, modelId),
          systemPrompt: fullPrompt,
          thinkingLevel: thinkingLevel || 'medium',
          tools: ['read', 'grep', 'find', 'ls', 'bash', 'edit', 'write'],
          customTools: getTools(cwd),
          authStorage,
        })

        const session = created.session
        session.setActiveToolsByName(['read', 'grep', 'find', 'ls', 'bash', 'edit', 'write'])
        console.log('[pi-server] Tools registered:', session.agent.state.tools.map(t => t.name).join(', '), `(${session.agent.state.tools.length})`)
        console.log('[pi-server] Using provider:', provider, 'model:', modelId)

        // Log what's being sent to the API
        const origStreamFn = session.agent.streamFn
        session.agent.streamFn = (m, ctx, opts) => {
          console.log('[pi-server] Sending request: tools=' + (ctx.tools?.length || 0), 'msgs=' + ctx.messages?.length)
          return origStreamFn.call(session.agent, m, ctx, opts)
        }

        wrapper = { session, emit: null }
        sessions.set(sessionId, wrapper)

        let pid = ''
        session.subscribe((event) => {
          const e = sessions.get(sessionId)?.emit
          if (!e) return
          switch (event.type) {
            case 'message_update': {
              const ev = event.assistantMessageEvent
              if (ev?.type === 'text_delta') e('text_delta', { delta: ev.delta, pid })
              else if (ev?.type === 'thinking_delta') e('thinking_delta', { delta: ev.delta })
              break
            }
            case 'tool_execution_start':
              e('tool_execution_start', { id: event.toolCallId, name: event.toolName, args: event.args }); break
            case 'tool_execution_end':
              e('tool_execution_end', { id: event.toolCallId, name: event.toolName, result: event.result, isError: event.isError }); break
          }
        })
      } else {
        // Update model on existing session
        const m = getModel(provider, modelId)
        if (m) wrapper.session.agent.state.model = m
      }

      wrapper.emit = emit
      await wrapper.session.agent.prompt(content)

      const msgs = wrapper.session.agent.state.messages
      const last = [...msgs].reverse().find(m => m.role === 'assistant')
      const text = last?.content?.find?.(c => c.type === 'text')?.text
        || (last?.errorMessage ? `Error: ${last.errorMessage}` : '')

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
