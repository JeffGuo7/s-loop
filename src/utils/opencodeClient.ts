import type { MessagePart, MessageInfo, KiloMessage } from '../types'

const DEFAULT_BASE = 'http://127.0.0.1:4096'

let _base = DEFAULT_BASE
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
    headers['x-opencode-directory'] = _projectDir
  }
  return headers
}

async function post(paths: string, body?: unknown) {
  const res = await fetch(url(paths), {
    method: 'POST',
    headers: getHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`OpenCode ${res.status}: ${txt}`)
  }
  return res
}

async function del(paths: string) {
  const res = await fetch(url(paths), {
    method: 'DELETE',
    headers: getHeaders(),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`OpenCode ${res.status}: ${txt}`)
  }
  return res
}

async function get(paths: string) {
  const res = await fetch(url(paths), {
    headers: getHeaders(),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`OpenCode ${res.status}: ${txt}`)
  }
  return res
}

async function patch(paths: string, body?: unknown) {
  const res = await fetch(url(paths), {
    method: 'PATCH',
    headers: getHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`OpenCode ${res.status}: ${txt}`)
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
  } catch {
    throw new Error(`Failed to parse JSON from ${paths}: ${text.slice(0, 100)}`)
  }
}

export async function health(): Promise<boolean> {
  try {
    const data = await getJson<{ healthy: boolean }>('/global/health')
    return data.healthy === true
  } catch {
    return false
  }
}

export interface OpenCodeSession {
  id: string
  title?: string
  createdAt?: number
  updatedAt?: number
}

export async function createSession(title?: string): Promise<OpenCodeSession> {
  const body: Record<string, unknown> = {}
  if (title) body.title = title
  const res = await post('/session', body)
  const text = await res.text()
  if (!text || text.trim() === '') {
    throw new Error('Empty response from /session')
  }
  return JSON.parse(text)
}

export async function listSessions(): Promise<OpenCodeSession[]> {
  return getJson<OpenCodeSession[]>('/session')
}

export async function deleteSession(id: string): Promise<void> {
  await del(`/session/${id}`)
}

export async function getMessages(sessionId: string): Promise<KiloMessage[]> {
  const data = await getJson<{ info: MessageInfo; parts: MessagePart[] }[]>(`/session/${sessionId}/message`)
  return data.map((msg) => ({
    info: msg.info,
    parts: msg.parts || [],
  }))
}

export interface SSECallbacks {
  onPartUpdated: (part: MessagePart) => void
  onPartDelta: (sessionID: string, messageID: string, partID: string, delta: string) => void
  onMessageUpdated: (info: MessageInfo) => void
  onSessionIdle: (sessionID: string) => void
  onError: (error: { message: string }) => void
  onConnected: () => void
}

let _eventSource: EventSource | null = null
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null
let _sseCallbacks: SSECallbacks | null = null

export function subscribeToEvents(callbacks: SSECallbacks): () => void {
  _sseCallbacks = callbacks
  connectSSE()
  return unsubscribeFromEvents
}

function connectSSE() {
  if (_eventSource) {
    _eventSource.close()
  }

  const params = new URLSearchParams()
  if (_projectDir) params.set('directory', _projectDir)
  const qs = params.toString()
  const eventUrl = url(`/global/event${qs ? '?' + qs : ''}`)

  const es = new EventSource(eventUrl)
  _eventSource = es

  es.onopen = () => {
    _sseCallbacks?.onConnected()
  }

  es.onmessage = (e) => {
    const raw = e.data
    if (!raw || !raw.trim()) return

    try {
      const evt = JSON.parse(raw)

      switch (evt.type) {
        case 'message.part.updated': {
          const part = evt.properties?.part as MessagePart | undefined
          if (part) {
            if (part.type === 'tool') {
              const p = part as unknown as Record<string, unknown>
              if (p.tool && !p.name) {
                p.name = p.tool
              }
            }
            _sseCallbacks?.onPartUpdated(part)
            const delta = evt.properties?.delta as string | undefined
            if (delta && part.sessionID && part.messageID && part.id) {
              _sseCallbacks?.onPartDelta(part.sessionID, part.messageID, part.id, delta)
            }
          }
          break
        }
        case 'message.part.delta': {
          const props = evt.properties
          if (props) {
            const sessionID = props.sessionID as string | undefined
            const messageID = props.messageID as string | undefined
            const partID = props.partID as string | undefined
            const delta = props.delta as string | undefined
            if (sessionID && messageID && partID && delta) {
              _sseCallbacks?.onPartDelta(sessionID, messageID, partID, delta)
            }
          }
          break
        }
        case 'message.updated': {
          const info = evt.properties?.info as MessageInfo | undefined
          if (info) {
            _sseCallbacks?.onMessageUpdated(info)
          }
          break
        }
        case 'session.idle': {
          const sessionID = evt.properties?.sessionID as string | undefined
          if (sessionID) {
            _sseCallbacks?.onSessionIdle(sessionID)
          }
          break
        }
        case 'session.error': {
          const error = evt.properties?.error as { message: string } | undefined
          _sseCallbacks?.onError(error || { message: 'Session error' })
          break
        }
        case 'server.connected':
        case 'server.heartbeat':
        case 'session.status':
        case 'session.turn.open':
        case 'session.turn.close':
          break
      }
    } catch {
    }
  }

  es.onerror = () => {
    es.close()
    _eventSource = null
    if (_sseCallbacks) {
      _reconnectTimer = setTimeout(connectSSE, 3000)
    }
  }
}

export function unsubscribeFromEvents() {
  _sseCallbacks = null
  if (_reconnectTimer) {
    clearTimeout(_reconnectTimer)
    _reconnectTimer = null
  }
  if (_eventSource) {
    _eventSource.close()
    _eventSource = null
  }
}

export interface ModelRef {
  providerID: string
  modelID: string
}

export interface ToolDefinition {
  name: string
  description: string
  input_schema: Record<string, unknown>
}

export async function promptAsync(
  sessionId: string,
  content: string,
  model?: ModelRef,
  tools?: ToolDefinition[],
): Promise<KiloMessage | undefined> {
  const body: Record<string, unknown> = {
    parts: [{ type: 'text', text: content }],
  }
  if (model) {
    body.model = model
  }
  if (tools && tools.length > 0) {
    body.tools = tools
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  }
  if (_projectDir) {
    headers['x-opencode-directory'] = _projectDir
  }

  const res = await fetch(url(`/session/${sessionId}/message`), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`OpenCode ${res.status}: ${txt}`)
  }

  const contentType = res.headers.get('content-type') || ''

  // Handle direct JSON response (non-streaming)
  if (contentType.includes('application/json')) {
    try {
      const data = (await res.json()) as Partial<KiloMessage> | undefined
      if (data?.info?.id) {
        return {
          info: data.info,
          parts: Array.isArray(data.parts) ? data.parts : [],
        }
      }
    } catch {
    }
    return undefined
  }

  // Handle NDJSON streaming response (OpenCode default)
  const reader = res.body?.getReader()
  if (!reader) return undefined

  const decoder = new TextDecoder()
  let buffer = ''
  let messageId = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('{')) continue

      try {
        const evt = JSON.parse(trimmed)

        if (evt.type === 'message' || evt.type === 'message.part.updated') {
          const partData = evt.properties?.part || evt.data
          if (partData?.id) {
            messageId = partData.messageID || partData.sessionID || messageId
            const safePart = partData as MessagePart
            _sseCallbacks?.onPartUpdated(safePart)
          }
        } else if (evt.type === 'message.part.delta') {
          const props = evt.properties || evt
          if (props.sessionID && props.messageID && props.partID && props.delta) {
            _sseCallbacks?.onPartDelta(props.sessionID, props.messageID, props.partID, props.delta)
          }
        } else if (evt.type === 'tool' || evt.type === 'tool-call') {
          const toolData = evt.data || evt
          if (toolData.tool || toolData.name) {
            const part: MessagePart = {
              id: `tool_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              type: 'tool',
              name: toolData.tool || toolData.name || '',
              state: { status: 'running' },
            } as unknown as MessagePart
            _sseCallbacks?.onPartUpdated(part)
          }
        } else if (evt.type === 'message.updated') {
          const info = evt.properties?.info || evt.info
          if (info) {
            _sseCallbacks?.onMessageUpdated(info as MessageInfo)
          }
        } else if (evt.type === 'complete') {
          messageId = evt.data?.messageID || evt.messageID || messageId
        } else if (evt.type === 'error') {
          _sseCallbacks?.onError({ message: evt.error?.message || evt.data?.message || 'Stream error' })
        }
      } catch {
        // Skip unparseable lines
      }
    }
  }

  if (!messageId) return undefined

  return {
    info: { id: messageId, sessionID: sessionId, role: 'assistant', time: { created: Date.now() } },
    parts: [],
  }
}

export async function abortSession(sessionId: string): Promise<void> {
  await post(`/session/${sessionId}/abort`)
}

let _activeAbort: AbortController | null = null

export function abortPrompt() {
  _activeAbort?.abort()
}

export async function prompt(
  sessionId: string,
  content: string,
  callbacks: {
    onPartUpdated: (sessionID: string, messageID: string, partID: string, part: MessagePart) => void
    onPartDelta: (sessionID: string, messageID: string, partID: string, delta: string) => void
    onMessageUpdated: (sessionID: string, messageID: string, info: MessageInfo) => void
    onComplete: (messageID: string) => void
    onError: (err: Error) => void
  },
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
      headers['x-opencode-directory'] = _projectDir
    }

    const res = await fetch(url(`/session/${sessionId}/message`), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`OpenCode ${res.status}: ${txt}`)
    }

    const contentType = res.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      const text = await res.text()
      if (!text || text.trim() === '') {
        throw new Error('Empty response from OpenCode API')
      }
      const data = JSON.parse(text)
      if (data.info?.id) {
        messageID = data.info.id
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

    const reader = res.body?.getReader()
    if (!reader) throw new Error('No response body')

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      let eventBoundary = buffer.indexOf('\n\n')
      while (eventBoundary !== -1) {
        const eventText = buffer.slice(0, eventBoundary)
        buffer = buffer.slice(eventBoundary + 2)

        const eventLines = eventText.split('\n')
        const dataLines: string[] = []
        for (const line of eventLines) {
          if (line.startsWith('data: ')) {
            dataLines.push(line.slice(6))
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5))
          }
        }

        if (dataLines.length === 0) {
          eventBoundary = buffer.indexOf('\n\n')
          continue
        }

        const raw = dataLines.join('\n').trim()
        if (!raw) {
          eventBoundary = buffer.indexOf('\n\n')
          continue
        }

        try {
          const evt = JSON.parse(raw)

          if (evt.type === 'message.part.updated' && evt.properties) {
            messageID = evt.properties.part?.messageID || messageID
            const part = evt.properties.part as Record<string, unknown>
            if (part.type === 'tool' && part.tool && !part.name) {
              part.name = part.tool
            }
            callbacks.onPartUpdated(sessionId, messageID, part.id as string, part as unknown as MessagePart)
            if (evt.properties.delta) {
              callbacks.onPartDelta(sessionId, messageID, part.id as string, evt.properties.delta as string)
            }
          } else if (evt.type === 'message.updated' && evt.properties) {
            callbacks.onMessageUpdated(sessionId, evt.properties.info?.id || messageID, evt.properties.info)
          } else if (evt.type === 'session.error' && evt.properties) {
            callbacks.onError(new Error(evt.properties.error?.message || 'Session error'))
          }
        } catch {
        }

        eventBoundary = buffer.indexOf('\n\n')
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

export interface OpenCodeProvider {
  id: string
  name: string
  source?: string
  env?: string[]
  models?: Record<string, { id: string; name: string }>
}

export async function listProviders(): Promise<OpenCodeProvider[]> {
  const data = await getJson<{ all?: OpenCodeProvider[] } | OpenCodeProvider[]>('/provider')
  if (data && typeof data === 'object' && 'all' in data) {
    return data.all ?? []
  }
  return data as OpenCodeProvider[]
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

export interface OpenCodeMCPServerInfo {
  name: string
  status: 'connected' | 'connecting' | 'error' | 'disabled'
  tools?: Array<{
    name: string
    description: string
    inputSchema: Record<string, unknown>
  }>
  resources?: Array<{
    name: string
    uri: string
    description?: string
    mimeType?: string
  }>
  error?: string
}

export async function getMCPServers(): Promise<Record<string, OpenCodeMCPServerInfo>> {
  const data = await getJson<unknown>('/mcp/servers')
  if (Array.isArray(data)) {
    const record: Record<string, OpenCodeMCPServerInfo> = {}
    for (const server of data) {
      if (typeof server === 'object' && server !== null) {
        const s = server as Record<string, unknown>
        record[s.name as string] = {
          name: s.name as string,
          status: (s.status as OpenCodeMCPServerInfo['status']) || 'connected',
          tools: s.tools as OpenCodeMCPServerInfo['tools'],
          resources: s.resources as OpenCodeMCPServerInfo['resources'],
          error: s.error as string | undefined,
        }
      }
    }
    return record
  }
  return data as Record<string, OpenCodeMCPServerInfo>
}

export async function addMCPServer(config: {
  name: string
  type: 'stdio' | 'sse' | 'http'
  command?: string
  args?: string[]
  url?: string
}): Promise<void> {
  const name = config.name
  const mcpConfig: Record<string, unknown> =
    config.type === 'stdio'
      ? {
          type: 'local',
          command: [...(config.command ? [config.command] : []), ...(config.args || [])],
        }
      : {
          type: 'remote',
          url: config.url,
        }

  await post('/mcp', { name, config: mcpConfig })
}

export async function connectMCPServer(name: string): Promise<void> {
  await post(`/mcp/${encodeURIComponent(name)}/connect`)
}

export async function disconnectMCPServer(name: string): Promise<void> {
  await post(`/mcp/${encodeURIComponent(name)}/disconnect`)
}

export interface SkillEntry {
  name: string
  description: string
  content?: string
  location?: string
}

export async function getSkills(): Promise<SkillEntry[]> {
  return getJson<SkillEntry[]>('/skill')
}

export async function respondToPermission(
  sessionId: string,
  permissionId: string,
  action: 'allow' | 'deny'
): Promise<void> {
  await post(`/session/${sessionId}/permissions/${permissionId}`, { action })
}

export async function listPermissions(): Promise<Array<{ id: string; permission: string; sessionID: string }>> {
  return getJson('/permission')
}

export async function setPermissionMode(
  sessionId: string,
  mode: 'ask' | 'allow' | 'deny',
  rules?: Record<string, 'ask' | 'allow' | 'deny'>
): Promise<void> {
  await patch(`/session/${sessionId}`, {
    permission: mode === 'allow' ? 'allow' : mode === 'deny' ? 'deny' : rules || 'ask'
  })
}
