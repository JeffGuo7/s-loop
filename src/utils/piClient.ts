import type { PermissionAction, PermissionRule } from '../types/agent'

const DEFAULT_BASE = 'http://127.0.0.1:4096'
let _base = DEFAULT_BASE

export function setBaseUrl(url: string) {
  _base = url.replace(/\/s+$/, '')
}

export function getBaseUrl() {
  return _base
}

export interface McpToolRequest {
  requestId: string
  serverName: string
  toolName: string
  arguments: Record<string, unknown>
}

export interface PiStreamCallbacks {
  onText: (pid: string, delta: string) => void
  onThinking: (delta: string) => void
  onToolCall: (id: string, name: string, args: any) => void
  onToolResult: (id: string, name: string, result: any) => void
  onMcpToolRequest?: (request: McpToolRequest) => void
  onDone: () => void
  onResult?: (text: string) => void
  onError?: (msg: string) => void
}

export interface McpToolDef {
  serverName: string
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface PromptResult {
  text: string
  error?: string
}

interface StreamState {
  abortController?: AbortController
  callbacks?: PiStreamCallbacks
}

const _streams = new Map<string, StreamState>()

export async function fetchModels(provider: string, apiKey?: string, baseUrl?: string, api?: string): Promise<Array<{ id: string; name: string }>> {
  try {
    let url = `${_base}/models?provider=${encodeURIComponent(provider)}`
    if (apiKey) url += `&apiKey=${encodeURIComponent(apiKey)}`
    if (baseUrl) url += `&baseUrl=${encodeURIComponent(baseUrl)}`
    if (api) url += `&api=${encodeURIComponent(api)}`
    const res = await fetch(url)
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

export async function health(): Promise<boolean> {
  try {
    const res = await fetch(`${_base}/health`)
    const data = await res.json()
    return data.healthy === true
  } catch {
    return false
  }
}

export async function waitForServer(timeoutMs = 30000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await health()) return true
    await new Promise(r => setTimeout(r, 1000))
  }
  return false
}

export async function createSession(): Promise<{ id: string }> {
  const res = await fetch(`${_base}/session`, { method: 'POST' })
  return res.json()
}

export async function syncRuntimeConfig(config: {
  providerID: string
  modelID: string
  apiKey?: string
  workspaceDir?: string
  providerConfig?: { api?: string; baseUrl?: string }
}): Promise<void> {
  await fetch(`${_base}/runtime/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
}

export function subscribeStream(
  sessionId: string,
  callbacks: PiStreamCallbacks,
): () => void {
  const existing = _streams.get(sessionId) || {}
  _streams.set(sessionId, { ...existing, callbacks })

  return () => {
    const current = _streams.get(sessionId)
    if (!current || current.callbacks !== callbacks) return
    if (current.abortController) {
      _streams.set(sessionId, { abortController: current.abortController })
    } else {
      _streams.delete(sessionId)
    }
  }
}

export async function prompt(
  sessionId: string,
  content: string,
  options?: {
    systemPrompt?: string
    providerID?: string
    modelID?: string
    thinkingLevel?: string
    tools?: McpToolDef[]
    apiKey?: string
    workspaceDir?: string
    webSearchConfig?: {
      provider?: string
      apiKey?: string
      apiUrl?: string
      limit?: number
    }
    permissionMode?: PermissionAction
    permissionRules?: PermissionRule
    providerAPI?: string
    providerConfig?: { api?: string; baseUrl?: string }
  },
): Promise<PromptResult> {
  const controller = new AbortController()
  const existing = _streams.get(sessionId) || {}
  _streams.set(sessionId, { ...existing, abortController: controller })

  try {
    const body: Record<string, any> = { content }
    if (options?.providerID) body.providerID = options.providerID
    if (options?.modelID) body.modelID = options.modelID
    if (options?.systemPrompt) body.systemPrompt = options.systemPrompt
    if (options?.thinkingLevel) body.thinkingLevel = options.thinkingLevel
    if (options?.apiKey) body.apiKey = options.apiKey
    if (options?.tools && options.tools.length > 0) body.tools = options.tools
    if (options?.workspaceDir) body.workspaceDir = options.workspaceDir
    if (options?.webSearchConfig) body.webSearchConfig = options.webSearchConfig
    if (options?.permissionMode) body.permissionMode = options.permissionMode
    if (options?.permissionRules) body.permissionRules = options.permissionRules
    if (options?.providerAPI) body.providerAPI = options.providerAPI
    if (options?.providerConfig) body.providerConfig = options.providerConfig

    const res = await fetch(`${_base}/session/${sessionId}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text()
      return { text: '', error: `Server ${res.status}: ${text}` }
    }

    const reader = res.body?.getReader()
    if (!reader) return { text: '', error: 'No response body' }

    const decoder = new TextDecoder()
    let buffer = ''
    let resultText = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Parse SSE events
      let lineEnd = buffer.indexOf('\n')
      while (lineEnd !== -1) {
        const line = buffer.slice(0, lineEnd)
        buffer = buffer.slice(lineEnd + 1)
        lineEnd = buffer.indexOf('\n')

        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith(':')) continue

        if (trimmed.startsWith('event: ')) {
          const eventType = trimmed.slice(7)
          // Read next line for data
          const nextEnd = buffer.indexOf('\n')
          const dataLine = nextEnd === -1 ? buffer.trim() : buffer.slice(0, nextEnd).trim()
          if (dataLine.startsWith('data: ')) {
            try {
              const data = JSON.parse(dataLine.slice(6))
              const cb = _streams.get(sessionId)?.callbacks
              switch (eventType) {
                case 'text_delta':
                  cb?.onText(data.pid || '', data.delta)
                  break
                case 'thinking_delta':
                  cb?.onThinking(data.delta)
                  break
                case 'tool_call':
                case 'tool_execution_start':
                  cb?.onToolCall(data.id, data.name, data.args)
                  break
                case 'tool_result':
                case 'tool_execution_end':
                  cb?.onToolResult(data.id, data.name, data.result)
                  break
                case 'mcp_tool_request':
                  cb?.onMcpToolRequest?.(data)
                  break
                case 'result':
                  resultText = data.text || ''
                  cb?.onResult?.(resultText)
                  break
                case 'error':
                  resultText = `Error: ${data.message}`
                  cb?.onError?.(data.message)
                  break
              }
              if (eventType === 'done') {
                cb?.onDone()
                return { text: resultText }
              }
            } catch { /* skip invalid JSON */ }
          }
          // Consume the data line
          if (nextEnd !== -1) {
            buffer = buffer.slice(nextEnd + 1)
            lineEnd = buffer.indexOf('\n')
          }
        }
      }
    }

    return { text: resultText }
  } catch (err) {
    if ((err as any)?.name === 'AbortError') return { text: '' }
    return { text: '', error: err instanceof Error ? err.message : String(err) }
  } finally {
    const current = _streams.get(sessionId)
    if (current?.abortController === controller) {
      if (current.callbacks) {
        _streams.set(sessionId, { callbacks: current.callbacks })
      } else {
        _streams.delete(sessionId)
      }
    }
  }
}

export function abortSession(sessionId?: string): void {
  if (!sessionId) return

  const current = _streams.get(sessionId)
  current?.abortController?.abort()

  if (!current) return
  if (current.callbacks) {
    _streams.set(sessionId, { callbacks: current.callbacks })
  } else {
    _streams.delete(sessionId)
  }
}

export async function sendMcpToolResponse(
  sessionId: string,
  requestId: string,
  result?: unknown,
  error?: string,
): Promise<void> {
  await fetch(`${_base}/session/${sessionId}/mcp-response`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId, result, error }),
  })
}
