import type { MessagePart } from '../types'

const DEFAULT_BASE = 'http://127.0.0.1:4096'
let _base = DEFAULT_BASE

export function setBaseUrl(url: string) {
  _base = url.replace(/\/s+$/, '')
}

export function getBaseUrl() {
  return _base
}

export interface PiStreamCallbacks {
  onText: (pid: string, delta: string) => void
  onThinking: (delta: string) => void
  onToolCall: (id: string, name: string, args: any) => void
  onToolResult: (id: string, name: string, result: any) => void
  onResult: (text: string) => void
  onDone: () => void
  onError: (msg: string) => void
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

let _currentAbort: AbortController | null = null
let _currentCallbacks: PiStreamCallbacks | null = null

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

function parseSSELine(line: string): { event: string; data: any } | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith(':')) return null
  const eventMatch = trimmed.match(/^event: (.+)$/)
  const dataMatch = trimmed.match(/^data: (.+)$/)
  if (eventMatch) return null // return on data line
  if (dataMatch) return null
  return null
}

export function subscribeStream(
  _sessionId: string,
  callbacks: PiStreamCallbacks,
): () => void {
  _currentCallbacks = callbacks
  return () => {
    _currentCallbacks = null
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
  },
): Promise<PromptResult> {
  const controller = new AbortController()
  _currentAbort = controller

  try {
    const body: Record<string, any> = { content }
    if (options?.providerID) body.providerID = options.providerID
    if (options?.modelID) body.modelID = options.modelID
    if (options?.systemPrompt) body.systemPrompt = options.systemPrompt
    if (options?.thinkingLevel) body.thinkingLevel = options.thinkingLevel
    if (options?.apiKey) body.apiKey = options.apiKey
    if (options?.tools && options.tools.length > 0) body.tools = options.tools
    if (options?.workspaceDir) body.workspaceDir = options.workspaceDir

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

    const cb = _currentCallbacks

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
              switch (eventType) {
                case 'text_delta':
                  cb?.onText(data.pid || '', data.delta)
                  break
                case 'thinking_delta':
                  cb?.onThinking(data.delta)
                  break
                case 'tool_call':
                  cb?.onToolCall(data.id, data.name, data.args)
                  break
                case 'tool_call_end':
                  cb?.onToolCall(data.id, data.name, data.args)
                  break
                case 'tool_result':
                  cb?.onToolResult(data.id, data.name, data.result)
                  break
                case 'result':
                  resultText = data.text || ''
                  cb?.onResult(resultText)
                  break
                case 'error':
                  resultText = `Error: ${data.message}`
                  cb?.onError(data.message)
                  break
              }
              if (eventType === 'done') return { text: resultText }
            } catch { /* skip invalid JSON */ }
          }
          // Consume the data line
          if (nextEnd !== -1) buffer = buffer.slice(nextEnd + 1)
        }
      }
    }

    return { text: resultText }
  } catch (err) {
    if ((err as any)?.name === 'AbortError') return { text: '' }
    return { text: '', error: err instanceof Error ? err.message : String(err) }
  } finally {
    _currentAbort = null
    _currentCallbacks = null
  }
}

export function abortSession(_sessionId?: string): void {
  _currentAbort?.abort()
  _currentAbort = null
}
