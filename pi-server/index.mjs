import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { Agent } from '@earendil-works/pi-agent-core'
import { getModel, Type } from '@earendil-works/pi-ai'
import { createCodingTools, createReadOnlyTools } from '@earendil-works/pi-coding-agent'

const PORT = parseInt(process.env.PI_SERVER_PORT || '4096')
const sessions = new Map()

function parseToolCall(text) {
  const regex = /<tool name="([^"]+)">(.+?)<\/tool>/s
  const match = text.match(regex)
  if (!match) return null
  try {
    const data = JSON.parse(match[2].trim())
    return { name: match[1], data }
  } catch {
    console.log('[pi-server] Tool parse failed:', text.slice(0, 200))
    return null
  }
}

const toolsCache = new Map()

function getTools(workspaceDir) {
  const dir = workspaceDir || process.cwd()
  if (!toolsCache.has(dir)) {
    const allT = [...createCodingTools(dir), ...createReadOnlyTools(dir)]
    const seen = new Set()
    toolsCache.set(dir, allT.filter(t => { if (seen.has(t.name)) return false; seen.add(t.name); return true }))
  }
  return toolsCache.get(dir)
}

async function executeToolByName(name, args, workspaceDir) {
  const tools = getTools(workspaceDir)
  const tool = tools.find(t => t.name === name)
  if (!tool) return { error: `Tool "${name}" not found` }

  // Special case: web_search is not in pi-coding-agent tools
  if (name === 'web_search') {
    try {
      const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(args.query || args)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })
      const html = await res.text()
      const results = []
      const titleRegex = /class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([^<]*)</g
      const snippetRegex = /class="[^"]*result__snippet[^"]*"[^>]*>([^<]*)</g
      let t, s
      while ((t = titleRegex.exec(html)) !== null && results.length < 8) {
        s = snippetRegex.exec(html)
        results.push({ title: t[2], url: t[1], snippet: s ? s[1] : '' })
      }
      return { result: results.length > 0 ? results : { message: 'No results' } }
    } catch (err) {
      return { error: `Search failed: ${err.message}` }
    }
  }

  try {
    const result = await tool.execute(`${name}_${Date.now()}`, args)
    return { result: result?.content?.[0]?.text || JSON.stringify(result) }
  } catch (err) {
    return { error: err.message }
  }
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
    sessions.set(id, { agent: null, emit: null, workspaceDir: null })
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

        session.workspaceDir = workspaceDir || session.workspaceDir

        // Build system prompt with tool description (prompt-based tools, not native API tools)
        const wsPrompt = systemPrompt || 'You are a helpful assistant.'
        const fullPrompt = `${wsPrompt}\n\n${buildToolPrompt(session.workspaceDir)}`

        if (!session.agent) {
          const effectiveThinking = model.reasoning && thinkingLevel !== 'off' ? (thinkingLevel || 'medium') : 'off'

          const agent = new Agent({
            initialState: {
              systemPrompt: fullPrompt,
              model,
              tools: [], // No native tools - use prompt-based
              thinkingLevel: effectiveThinking,
            },
            sessionId,
            getApiKey: async () => apiKey,
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
            }
          })

          session.agent = agent
        } else {
          if (providerID && modelID && getModel(providerID, modelID)) {
            session.agent.state.model = getModel(providerID, modelID)
          }
          session.agent.state.systemPrompt = fullPrompt
          if (model?.reasoning && thinkingLevel) session.agent.state.thinkingLevel = thinkingLevel
        }

        session.emit = emit

        // Prompt with tool loop
        let currentPrompt = content
        let maxTurns = 10
        let allText = ''

        while (maxTurns-- > 0) {
          await session.agent.prompt(currentPrompt)

          const messages = session.agent.state.messages
          const last = [...messages].reverse().find(m => m.role === 'assistant')
          const textContent = last?.content?.find?.(c => c.type === 'text')
          const responseText = textContent?.text || ''

          allText = responseText

          // Check for tool calls in the response
          const toolCall = parseToolCall(responseText)
          if (toolCall) {
            emit('tool_call', { id: toolCall.name, name: toolCall.name, args: toolCall.data })

            const result = await executeToolByName(toolCall.name, toolCall.data, session.workspaceDir)

            emit('tool_execution_end', {
              id: toolCall.name,
              name: toolCall.name,
              result: result,
              isError: !!result.error,
            })

            // Build tool result message for next turn
            const resultText = result.error ? `Error: ${result.error}` : JSON.stringify(result.result)
            currentPrompt = `<tool_result name="${toolCall.name}">${resultText}</tool_result>`
            continue
          }

          // No tool call found, exit loop
          break
        }

        emit('result', { text: allText || (last?.errorMessage ? `Error: ${last.errorMessage}` : '') })
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
