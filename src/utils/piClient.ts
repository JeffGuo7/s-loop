import { Agent, type AgentMessage } from '@earendil-works/pi-agent-core'
import { getModel } from '@earendil-works/pi-ai'

// ---- Types (match existing interface from opencodeClient) ----

export interface StreamCallbacks {
  onPartStart: (sessionID: string, messageID: string, partID: string, type: string, text: string) => void
  onPartDelta: (sessionID: string, messageID: string, partID: string, delta: string) => void
  onPartEnd: (sessionID: string, messageID: string, partID: string) => void
  onMessageEnd: (sessionID: string, messageID: string) => void
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

// ---- Per-session Agent instances ----

const agents = new Map<string, Agent>()
const callbacksMap = new Map<string, StreamCallbacks>()
const partCounters = new Map<string, number>()

function nextPartId(sessionId: string, prefix = 'p'): string {
  const count = (partCounters.get(sessionId) || 0) + 1
  partCounters.set(sessionId, count)
  return `${prefix}-${count}-${Date.now()}`
}

function getOrCreateMessageId(sessionId: string): string {
  return `msg-${sessionId}-${Date.now()}`
}

// ---- Main API ----

export function parseModelRef(modelStr: string): ModelRef | null {
  if (!modelStr || !modelStr.includes('/')) return null
  const [providerID, ...rest] = modelStr.split('/')
  return { providerID: providerID || 'anthropic', modelID: rest.join('/') }
}

export async function promptAsync(
  sessionId: string,
  content: string,
  model?: ModelRef,
  _tools?: ToolDefinition[],
  callbacks?: StreamCallbacks,
): Promise<AgentMessage | null> {
  let agent = agents.get(sessionId)
  const cbs = callbacks || callbacksMap.get(sessionId)
  if (!cbs) {
    console.warn(`[pi] No callbacks for session ${sessionId}, skipping prompt`)
    return null
  }

  if (!agent) {
    const piModel = getModel(
      (model?.providerID || 'anthropic') as any,
      (model?.modelID || 'claude-sonnet-4-20250514') as any,
    )

    agent = new Agent({
      initialState: {
        systemPrompt: 'You are a helpful assistant.',
        model: piModel,
        tools: [],
      },
      sessionId,
    })

    agents.set(sessionId, agent)
  }

  if (model) {
    try {
      agent.state.model = getModel(model.providerID as any, model.modelID as any)
    } catch {
      // keep default
    }
  }

  const messageID = getOrCreateMessageId(sessionId)

  const unsub = agent.subscribe(async (event) => {
    switch (event.type) {
      case 'message_start': {
        const msg = event.message
        if (msg.role === 'assistant') {
          const partId = nextPartId(sessionId)
          cbs.onPartStart(sessionId, messageID, partId, 'text', '')
        }
        break
      }
      case 'message_update': {
        const evt = event as { type: 'message_update'; message: AgentMessage; assistantMessageEvent: { delta?: string } }
        const delta = evt.assistantMessageEvent?.delta
        if (delta) {
          const partId = `text-${messageID}`
          cbs.onPartDelta(sessionId, messageID, partId, delta)
        }
        break
      }
      case 'message_end': {
        const msg = event.message
        if (msg.role === 'assistant') {
          const partId = `text-${messageID}`
          cbs.onPartEnd(sessionId, messageID, partId)
        }
        break
      }
      case 'tool_execution_start': {
        const evt = event as { type: 'tool_execution_start'; toolCallId: string; toolName: string; args: any }
        const partId = nextPartId(sessionId, 'tool')
        cbs.onPartStart(sessionId, messageID, partId, 'tool', evt.toolName)
        break
      }
      case 'tool_execution_end': {
        const evt = event as { type: 'tool_execution_end'; toolCallId: string; toolName: string; result: any; isError: boolean }
        cbs.onPartEnd(sessionId, messageID, evt.toolCallId)
        break
      }
    }
  })

  await agent.prompt(content)

  unsub()

  cbs.onMessageEnd(sessionId, messageID)

  // Return the last assistant message if available
  if (agent.state.messages.length > 0) {
    const lastMessages = agent.state.messages.filter(m => m.role === 'assistant')
    return lastMessages[lastMessages.length - 1] || null
  }
  return null
}

export async function abortSession(sessionId: string): Promise<void> {
  const agent = agents.get(sessionId)
  if (agent) {
    agent.abort()
  }
}

export async function resetSession(sessionId: string): Promise<void> {
  const agent = agents.get(sessionId)
  if (agent) {
    agent.reset()
  }
}

export async function removeSession(sessionId: string): Promise<void> {
  const agent = agents.get(sessionId)
  if (agent) {
    agent.abort()
    agents.delete(sessionId)
  }
  callbacksMap.delete(sessionId)
  partCounters.delete(sessionId)
}

export function setStreamCallbacks(sessionId: string, callbacks: StreamCallbacks): void {
  callbacksMap.set(sessionId, callbacks)
}

export function removeStreamCallbacks(sessionId: string): void {
  callbacksMap.delete(sessionId)
}

// ---- SSE-style event subscription (compatibility with old Kilo SSE) ----

export interface SSECallbacks {
  onPartUpdated?: (part: { sessionID: string; messageID: string; id: string; delta?: string }) => void
  onPartDelta?: (sessionID: string, messageID: string, partID: string, delta: string) => void
  onMessageStart?: (sessionID: string, messageID: string, parts: any[]) => void
  onMessageCompleted?: (sessionID: string, messageID: string) => void
  onMessageUpdated?: (info: { id: string; sessionID: string; role: string }) => void
  onSessionIdle?: (sessionID: string) => void
  onError?: (err: Error) => void
  onConnected?: () => void
  onDisconnected?: () => void
}

/** 
 * Compatibility shim: Pi doesn't use SSE subscriptions. 
 * Streaming is handled per-session via callbacksMap inside promptAsync.
 * This returns a no-op cleanup function so the ChatView's useEffect doesn't break.
 */
export function subscribeToEvents(_callbacks: SSECallbacks): () => void {
  // Fire onConnected immediately (Pi is always "connected")
  _callbacks.onConnected?.()
  return () => {} // no-op cleanup
}

/** Pi is always available (no external server needed) */
export async function health(): Promise<boolean> {
  return true
}

/** 
 * Create a session handle. 
 * Pi uses Agent instances (created lazily inside promptAsync), 
 * so this returns a virtual session object.
 */
export async function createSession(title?: string): Promise<{ id: string }> {
  const id = `pi-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return { id }
}

/** 
 * Set permission mode. 
 * Pi handles permissions via beforeToolCall hook (configured per-session).
 * For now, this is a no-op since Pi's default behavior handles it.
 */
export async function setPermissionMode(_sessionId: string, _mode: 'ask' | 'allow' | 'deny'): Promise<void> {
  // Will be implemented when we add Pi Agent beforeToolCall integration
}
