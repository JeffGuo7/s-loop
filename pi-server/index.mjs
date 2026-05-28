import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { Agent } from '@earendil-works/pi-agent-core'
import { getModel } from '@earendil-works/pi-ai'
import { createCodingTools, createReadOnlyTools } from '@earendil-works/pi-coding-agent'

const PORT = parseInt(process.env.PI_SERVER_PORT || '4096')
const sessions = new Map()

function createSSE(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

// Cache tools per workspace directory (tool factories are expensive)
const toolsCache = new Map()
function getTools(dir) {
  const key = dir || process.cwd()
  if (!toolsCache.has(key)) {
    const allTools = [...createCodingTools(key), ...createReadOnlyTools(key)]
    const seen = new Set()
    const tools = allTools.filter(t => {
      if (seen.has(t.name)) return false
      seen.add(t.name)
      return true
    })
    toolsCache.set(key, tools)
    console.log(`[pi-server] Loaded ${tools.length} tools for ${key}:`, tools.map(t => t.name).join(', '))
  }
  return toolsCache.get(key)
}

createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ healthy: true }))
    return
  }

  if (req.method === 'POST' && url.pathname === '/session') {
    const id = randomUUID()
    sessions.set(id, { agent: null, emit: null })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ id }))
    return
  }

  const msgMatch = url.pathname.match(/^\/session\/([^/]+)\/message$/)
  if (req.method === 'POST' && msgMatch) {
    const sessionId = msgMatch[1]
    let session = sessions.get(sessionId)
    if (!session) { res.writeHead(404); res.end('Session not found'); return }

    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', async () => {
      const { content, providerID, modelID, apiKey, systemPrompt, thinkingLevel, workspaceDir } = JSON.parse(body)

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      })

      const emit = (event, data) => { try { res.write(createSSE(event, data)) } catch {} }

      try {
        const provider = providerID || 'anthropic'
        const modelId = modelID || 'claude-sonnet-4-20250514'
        const model = getModel(provider, modelId)
        if (!model) {
          emit('error', { message: `Model ${modelId} not found for ${provider}` })
          emit('done', {}); res.end(); return
        }

        // Build system prompt with workspace context
        const basePrompt = systemPrompt || 'You are a helpful assistant. Use the available tools when needed.'
        const fullPrompt = workspaceDir
          ? `${basePrompt}\n\nWorkspace directory: ${workspaceDir}`
          : basePrompt

        // Native tools from pi-coding-agent (openclaw uses the same approach)
        const tools = getTools(workspaceDir || process.cwd())

        // For models that support reasoning, check if it interferes with tool calling.
        // Some models (like DeepSeek) can't do reasoning + tool calling simultaneously.
        // We'll try reasoning first; if tools don't work, user can set thinkingLevel: 'off'.
        const effectiveThinking = model.reasoning && thinkingLevel !== 'off' ? (thinkingLevel || 'medium') : 'off'

        if (!session.agent) {
          const agent = new Agent({
            initialState: {
              systemPrompt: fullPrompt,
              model,
              tools,
              thinkingLevel: effectiveThinking,
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
                if (ev.type === 'text_delta') { e('text_delta', { delta: ev.delta, pid }) }
                else if (ev.type === 'thinking_delta') { e('thinking_delta', { delta: ev.delta }) }
                break
              }
              case 'tool_execution_start': {
                e('tool_execution_start', { id: event.toolCallId, name: event.toolName, args: event.args })
                break
              }
              case 'tool_execution_end': {
                e('tool_execution_end', { id: event.toolCallId, name: event.toolName, result: event.result, isError: event.isError })
                break
              }
            }
          })

          session.agent = agent
        } else {
          if (providerID && modelID) {
            const m = getModel(providerID, modelID)
            if (m) session.agent.state.model = m
          }
          session.agent.state.systemPrompt = fullPrompt
          if (model?.reasoning) {
            session.agent.state.thinkingLevel = effectiveThinking
          }
          // Refresh tools on each turn (in case workspace changed)
          session.agent.state.tools = tools
        }

        session.emit = emit

        await session.agent.prompt(content)

        const messages = session.agent.state.messages
        const last = [...messages].reverse().find(m => m.role === 'assistant')
        const text = last?.content?.find?.(c => c.type === 'text')?.text || (last?.errorMessage ? `Error: ${last.errorMessage}` : '')

        emit('result', { text: text || '' })
        emit('done', {})
      } catch (err) {
        try { emit('error', { message: err.message || String(err) }); emit('done', {}) } catch {}
      }

      session.emit = null
      try { res.end() } catch {}
    })
    return
  }

  res.writeHead(404)
  res.end('Not found')
}).listen(PORT, '127.0.0.1', () => {
  console.log(`[pi-server] listening on http://127.0.0.1:${PORT}`)
})
