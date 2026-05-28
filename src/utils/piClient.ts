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
): Promise<void> {
  let agent = agents.get(sessionId)
  const callbacks = callbacksMap.get(sessionId)
  if (!callbacks) return

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
          callbacks.onPartStart(sessionId, messageID, partId, 'text', '')
        }
        break
      }
      case 'message_update': {
        const evt = event as { type: 'message_update'; message: AgentMessage; assistantMessageEvent: { delta?: string } }
        const delta = evt.assistantMessageEvent?.delta
        if (delta) {
          const partId = `text-${messageID}`
          callbacks.onPartDelta(sessionId, messageID, partId, delta)
        }
        break
      }
      case 'message_end': {
        const msg = event.message
        if (msg.role === 'assistant') {
          const partId = `text-${messageID}`
          callbacks.onPartEnd(sessionId, messageID, partId)
        }
        break
      }
      case 'tool_execution_start': {
        const evt = event as { type: 'tool_execution_start'; toolCallId: string; toolName: string; args: any }
        const partId = nextPartId(sessionId, 'tool')
        callbacks.onPartStart(sessionId, messageID, partId, 'tool', evt.toolName)
        break
      }
      case 'tool_execution_end': {
        const evt = event as { type: 'tool_execution_end'; toolCallId: string; toolName: string; result: any; isError: boolean }
        callbacks.onPartEnd(sessionId, messageID, evt.toolCallId)
        break
      }
    }
  })

  await agent.prompt(content)

  unsub()

  callbacks.onMessageEnd(sessionId, messageID)
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
