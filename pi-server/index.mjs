import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { Agent } from '@earendil-works/pi-agent-core'
import { getModel, Type } from '@earendil-works/pi-ai'
import { createCodingTools, createReadOnlyTools } from '@earendil-works/pi-coding-agent'

const PORT = parseInt(process.env.PI_SERVER_PORT || '4096')
const sessions = new Map()

function createSSE(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

const webSearchTool = {
  name: 'web_search',
  label: 'Web Search',
  description: 'Search the web. Returns a list of search results with titles, URLs, and snippets.',
  parameters: Type.Object({
    query: Type.String({ description: 'The search query' }),
  }),
  execute: async (_toolCallId, params) => {
    try {
      const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(params.query)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })
      const html = await res.text()

      // Parse search results from DuckDuckGo HTML
      const results = []
      const resultRegex = /<a rel="nofollow" class="result__a" href="([^"]+)".*?>(.*?)<\/a>.*?<a class="result__snippet"[^>]*>(.*?)<\/a>/gs
      let match
      while ((match = resultRegex.exec(html)) !== null && results.length < 8) {
        results.push({
          title: match[2].replace(/<[^>]+>/g, ''),
          url: match[1],
          snippet: match[3].replace(/<[^>]+>/g, ''),
        })
      }

      // Fallback if regex fails
      if (results.length === 0) {
        const snippetRegex = /class="[^"]*result__snippet[^"]*"[^>]*>([^<]*)</g
        const titleRegex = /class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([^<]*)</g
        let t, s
        while ((t = titleRegex.exec(html)) !== null && results.length < 8) {
          s = snippetRegex.exec(html)
          results.push({ title: t[2], url: t[1], snippet: s ? s[1] : '' })
        }
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(results.length > 0 ? results : { message: 'No results found', html: html.slice(0, 2000) }) }],
        details: { count: results.length },
      }
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Search failed: ${err.message}` }],
        details: {},
      }
    }
  },
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

        if (!session.agent) {
          const wsPrompt = systemPrompt || 'You are a helpful assistant.'
          const fullPrompt = workspaceDir
            ? `${wsPrompt}\n\nYour workspace directory is: ${workspaceDir}\nYou have tools to read/search files, run commands, edit files, and search the web.`
            : `${wsPrompt}\n\nYou have tools to search the web and run commands.`

          const codingDir = workspaceDir || process.cwd()
          const allTools = [
            ...createCodingTools(codingDir),
            ...createReadOnlyTools(codingDir),
            webSearchTool,
          ]
          // Deduplicate by name
          const seen = new Set()
          const tools = allTools.filter(t => {
            if (seen.has(t.name)) return false
            seen.add(t.name)
            return true
          })

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
              emit('tool_call', { id: toolCall.id, name: toolCall.name, args: toolCall.arguments })
              return undefined
            },
            toolExecution: 'sequential',
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
                else if (ev.type === 'toolcall_start') { e('tool_call', { id: ev.id, name: ev.toolName, args: {} }) }
                else if (ev.type === 'toolcall_end') { e('tool_call_end', { id: ev.toolCall.id, name: ev.toolCall.name, args: ev.toolCall.arguments }) }
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
          if (providerID && modelID && getModel(providerID, modelID)) {
            session.agent.state.model = getModel(providerID, modelID)
          }
          if (model?.reasoning && thinkingLevel) session.agent.state.thinkingLevel = thinkingLevel
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
