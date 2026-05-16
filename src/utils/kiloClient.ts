// HTTP client for Kilo serve API
// Handles SSE streaming for real-time message updates

import type { MessagePart, SSEEvent, KiloMessage, MessageInfo } from '../types'

const DEFAULT_BASE = 'http://127.0.0.1:4096'

let _base = DEFAULT_BASE
let _fetch: typeof fetch = globalThis.fetch.bind(globalThis)
let _projectDir: string | null = null

export function setBaseUrl(url: string) {
  _base = url.replace(/\/$/, '')
}

export function getBaseUrl() {
  return _base
}

export function setProjectDir(dir: string | null) {
  _projectDir = dir
}

export function getProjectDir() {
  return _projectDir
}

function url(paths: string) {
  return `${_base}${paths}`
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (_projectDir) {
    headers['x-kilo-directory'] = _projectDir
  }
  return headers
}

async function post(paths: string, body?: unknown) {
  const res = await _fetch(url(paths), {
    method: 'POST',
    headers: getHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Kilo ${res.status}: ${txt}`)
  }
  return res
}

async function del(paths: string) {
  const res = await _fetch(url(paths), {
    method: 'DELETE',
    headers: getHeaders(),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Kilo ${res.status}: ${txt}`)
  }
  return res
}

async function get(paths: string) {
  const res = await _fetch(url(paths), {
    headers: getHeaders(),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Kilo ${res.status}: ${txt}`)
  }
  return res
}

async function getJson<T>(paths: string): Promise<T> {
  const res = await get(paths)
  const text = await res.text()
  if (!text || text.trim() === '') {
    throw new Error(`Empty response from ${paths}`)
  }
  try {
    return JSON.parse(text) as T
  } catch (e) {
    throw new Error(`Failed to parse JSON from ${paths}: ${text.slice(0, 100)}`)
  }
}

// ----- Health -----

export async function health(): Promise<boolean> {
  try {
    const data = await getJson<{ healthy: boolean }>('/global/health')
    return data.healthy === true
  } catch {
    return false
  }
}

// ----- Session -----

export interface KiloSession {
  id: string
  title?: string
  createdAt?: number
  updatedAt?: number
}

export async function createSession(title?: string): Promise<KiloSession> {
  const body: Record<string, unknown> = {}
  if (title) body.title = title
  const res = await post('/session', body)
  const text = await res.text()
  if (!text || text.trim() === '') {
    throw new Error('Empty response from /session')
  }
  return JSON.parse(text)
}

export async function listSessions(): Promise<KiloSession[]> {
  return getJson<KiloSession[]>('/session')
}

export async function deleteSession(id: string): Promise<void> {
  await del(`/session/${id}`)
}

// ----- Messages -----

export async function getMessages(sessionId: string): Promise<KiloMessage[]> {
  const data = await getJson<{ info: MessageInfo; parts: MessagePart[] }[]>(`/session/${sessionId}/message`)
  // Convert to our format
  return data.map((msg) => ({
    info: msg.info,
    parts: msg.parts || [],
  }))
}

// ----- Prompt (streaming) -----

export interface StreamCallbacks {
  onPartUpdated: (sessionID: string, messageID: string, partID: string, part: MessagePart) => void
  onPartDelta: (sessionID: string, messageID: string, partID: string, delta: string) => void
  onMessageUpdated: (sessionID: string, messageID: string, info: MessageInfo) => void
  onComplete: (messageID: string) => void
  onError: (err: Error) => void
}

let _activeAbort: AbortController | null = null

export function abortPrompt() {
  _activeAbort?.abort()
}

export interface ModelRef {
  providerID: string
  modelID: string
}

/**
 * Send a prompt to a Kilo session and stream the response via SSE.
 * Parses Kilo's event format: message.part.updated, message.part.delta, message.updated
 * Also handles direct JSON response when SSE is not available.
 */
export async function prompt(
  sessionId: string,
  content: string,
  callbacks: StreamCallbacks,
  model?: ModelRef,
): Promise<string> {
  const controller = new AbortController()
  _activeAbort = controller

  const body: Record<string, unknown> = {
    parts: [{ type: 'text', text: content }],
  }
  if (model) {
    body.model = model
  }

  let messageID = ''

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    }
    if (_projectDir) {
      headers['x-kilo-directory'] = _projectDir
    }

    const res = await fetch(url(`/session/${sessionId}/message`), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`Kilo ${res.status}: ${txt}`)
    }

    const contentType = res.headers.get('content-type') || ''

    // Handle direct JSON response (non-streaming)
    if (contentType.includes('application/json')) {
      const text = await res.text()
      if (!text || text.trim() === '') {
        throw new Error('Empty response from Kilo API')
      }
      let data
      try {
        data = JSON.parse(text)
      } catch (e) {
        console.error('[kiloClient] Failed to parse JSON:', text.slice(0, 200))
        throw new Error(`Failed to parse JSON response: ${text.slice(0, 100)}`)
      }
      if (data.info?.id) {
        messageID = data.info.id
        // Process all parts
        if (data.parts && Array.isArray(data.parts)) {
          for (const part of data.parts) {
            if (part.id) {
              callbacks.onPartUpdated(sessionId, messageID, part.id, part)
            }
          }
        }
        if (data.info) {
          callbacks.onMessageUpdated(sessionId, messageID, data.info)
        }
      }
      callbacks.onComplete(messageID)
      return messageID
    }

    // Handle SSE streaming response
    const reader = res.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let buffer = ''

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
          const evt = JSON.parse(raw) as SSEEvent

          switch (evt.type) {
            case 'message.part.updated': {
              messageID = evt.messageID
              const part = evt.part as unknown as Record<string, unknown>
              if (part.type === 'tool' && part.tool && !part.name) {
                part.name = part.tool
              }
              callbacks.onPartUpdated(evt.sessionID, evt.messageID, evt.partID, part as unknown as MessagePart)
              break
            }
            case 'message.part.delta': {
              callbacks.onPartDelta(evt.sessionID, evt.messageID, evt.partID, evt.delta)
              break
            }
            case 'message.updated': {
              callbacks.onMessageUpdated(evt.sessionID, evt.messageID, evt.info)
              break
            }
            case 'session.error': {
              callbacks.onError(new Error(evt.error?.message || 'Session error'))
              break
            }
            case 'server.connected':
            case 'server.heartbeat':
              // Ignore these
              break
          }
        } catch {
          // Skip unparseable events
        }
      }
    }

    callbacks.onComplete(messageID)
    return messageID
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
  source?: string
  env?: string[]
  models?: Record<string, { id: string; name: string }>
}

export async function listProviders(): Promise<KiloProvider[]> {
  const data = await getJson<{ all?: KiloProvider[] } | KiloProvider[]>('/provider')
  if (data && typeof data === 'object' && 'all' in data) {
    return data.all ?? []
  }
  return data as KiloProvider[]
}

export async function getConfig(): Promise<Record<string, unknown>> {
  return getJson<Record<string, unknown>>('/config')
}

export async function updateConfig(config: Record<string, unknown>): Promise<void> {
  await fetch(url('/config'), {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(config),
  })
}

export async function setProviderApiKey(providerId: string, apiKey: string): Promise<void> {
  await fetch(url('/config'), {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({
      provider: {
        [providerId]: {
          options: { apiKey },
        },
      },
    }),
  })
}

// ----- MCP -----

export interface MCPServerInfo {
  name: string
  status?: 'connected' | 'connecting' | 'error' | 'disabled'
  tools?: string[]
}

export async function getMCPServers(): Promise<MCPServerInfo[]> {
  return getJson<MCPServerInfo[]>('/mcp')
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