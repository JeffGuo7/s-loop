// Thin HTTP client for Kilo serve API
// Replaces the raw fetch-based AI provider calls with the Kilo agent loop

const DEFAULT_BASE = 'http://127.0.0.1:4096'

let _base = DEFAULT_BASE
let _fetch: typeof fetch = globalThis.fetch.bind(globalThis)

export function setBaseUrl(url: string) {
  _base = url.replace(/\/$/, '')
}

export function getBaseUrl() {
  return _base
}

function url(path: string) {
  return `${_base}${path}`
}

async function post(path: string, body?: unknown) {
  const res = await _fetch(url(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Kilo ${res.status}: ${txt}`)
  }
  return res
}

async function del(path: string) {
  const res = await _fetch(url(path), { method: 'DELETE' })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Kilo ${res.status}: ${txt}`)
  }
  return res
}

// ----- Types -----

export interface KiloSession {
  id: string
  title?: string
  createdAt?: number
  updatedAt?: number
}

export interface KiloMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp?: number
}

export interface PromptChunk {
  type: 'data'
  data: string
}

// ----- Health -----

export async function health(): Promise<boolean> {
  try {
    const res = await _fetch(url('/global/health'))
    const data = await res.json()
    return data.healthy === true
  } catch {
    return false
  }
}

// ----- Session -----

export async function createSession(title?: string): Promise<KiloSession> {
  const body: Record<string, unknown> = {}
  if (title) body.title = title
  const res = await post('/session', body)
  return res.json()
}

export async function listSessions(): Promise<KiloSession[]> {
  const res = await _fetch(url('/session'))
  return res.json()
}

export async function deleteSession(id: string): Promise<void> {
  await del(`/session/${id}`)
}

// ----- Messages -----

export async function getMessages(sessionId: string): Promise<KiloMessage[]> {
  const res = await _fetch(url(`/session/${sessionId}/message`))
  return res.json()
}

// ----- Prompt (streaming) -----

export interface StreamCallbacks {
  onToken: (text: string, messageId: string) => void
  onThinking?: (text: string) => void
  onToolStart?: (name: string, input: unknown) => void
  onToolComplete?: (name: string, output: string) => void
  onComplete: () => void
  onError: (err: Error) => void
}

let _activeAbort: AbortController | null = null

export function abortPrompt() {
  _activeAbort?.abort()
}

/**
 * Send a prompt to a Kilo session and stream the response via SSE.
 * Returns the message ID for tracking.
 */
export async function prompt(
  sessionId: string,
  content: string,
  callbacks: StreamCallbacks,
): Promise<string> {
  const controller = new AbortController()
  _activeAbort = controller

  try {
    const res = await fetch(url(`/session/${sessionId}/message`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ parts: [{ type: 'text', text: content }] }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`Kilo ${res.status}: ${txt}`)
    }

    const reader = res.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let buffer = ''
    let msgId = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6).trim()
        if (!raw) continue

        try {
          const evt = JSON.parse(raw)
          if (!evt.type) continue

          switch (evt.type) {
            case 'message_start': {
              msgId = evt.message?.id || ''
              break
            }
            case 'content_block_delta': {
              if (evt.delta?.text) {
                callbacks.onToken(evt.delta.text, msgId)
              }
              break
            }
            case 'thinking_delta': {
              if (evt.delta?.thinking) {
                callbacks.onThinking?.(evt.delta.thinking)
              }
              break
            }
            case 'tool_use': {
              callbacks.onToolStart?.(
                evt.tool?.name || 'unknown',
                evt.tool?.input,
              )
              break
            }
            case 'tool_result': {
              callbacks.onToolComplete?.(
                evt.tool?.name || 'unknown',
                evt.tool?.output || '',
              )
              break
            }
            case 'message_stop':
            case 'stream_end': {
              callbacks.onComplete()
              return msgId
            }
            case 'error': {
              callbacks.onError(new Error(evt.error?.message || 'Unknown error'))
              return msgId
            }
          }
        } catch {
          // skip unparseable events
        }
      }
    }

    callbacks.onComplete()
    return msgId
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return ''
    }
    callbacks.onError(err instanceof Error ? err : new Error(String(err)))
    return ''
  } finally {
    _activeAbort = null
  }
}

// ----- Provider / Config -----

export interface KiloProvider {
  id: string
  name: string
  models?: { id: string; name: string }[]
}

export async function listProviders(): Promise<KiloProvider[]> {
  const res = await _fetch(url('/provider'))
  return res.json()
}

export async function getConfig(): Promise<Record<string, unknown>> {
  const res = await _fetch(url('/config'))
  return res.json()
}

export async function updateConfig(config: Record<string, unknown>): Promise<void> {
  await fetch(url('/config'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  })
}

// ----- MCP -----

export interface MCPServerInfo {
  name: string
  status?: 'connected' | 'connecting' | 'error' | 'disabled'
  tools?: string[]
}

export async function getMCPServers(): Promise<MCPServerInfo[]> {
  const res = await _fetch(url('/mcp'))
  return res.json()
}

export async function addMCPServer(config: {
  name: string
  type: 'stdio' | 'sse' | 'http'
  command?: string
  args?: string[]
  url?: string
}): Promise<void> {
  await post('/mcp', { config })
}
