import { Agent, type AgentEvent } from '@earendil-works/pi-agent-core'
import { getModel, getProviders, getModels } from '@earendil-works/pi-ai'

export interface PiStreamCallbacks {
  onDelta: (pid: string, delta: string) => void
  onDone: () => void
}

interface AgentSession {
  agent: Agent
  streamCbs: PiStreamCallbacks | null
}

const sessions = new Map<string, AgentSession>()
let apiKeyResolver: ((provider: string) => string | undefined) | null = null

export function setApiKeyResolver(resolver: (provider: string) => string | undefined) {
  apiKeyResolver = resolver
}

export function listProviders(): string[] {
  return getProviders()
}

export function listProviderModels(provider: string) {
  return getModels(provider as any)
}

export async function createSession(): Promise<{ id: string }> {
  const id = `pi-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return { id }
}

function nextID(): string {
  return `pi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function extractMessageText(msg: any): string {
  if (!msg || msg.role !== 'assistant') return ''
  if (msg.errorMessage) return `Error: ${msg.errorMessage}`
  const content = Array.isArray(msg.content) ? msg.content : []
  const textContent = content.find((c: any) => c.type === 'text')
  if (textContent?.text) return textContent.text
  if (content.length > 0 && typeof content[0]?.text === 'string') return content[0].text
  return ''
}

function buildAgent(
  sessionId: string,
  options?: { providerID?: string; modelID?: string; systemPrompt?: string },
): Agent | null {
  const provider = options?.providerID || 'anthropic'
  const modelId = options?.modelID || 'claude-sonnet-4-20250514'
  const model = getModel(provider as any, modelId as any)
  if (!model) return null

  const agent = new Agent({
    initialState: {
      systemPrompt: options?.systemPrompt || 'You are a helpful assistant.',
      model,
      tools: [],
    },
    sessionId,
    getApiKey: async (provider) => apiKeyResolver?.(provider),
  })

  let pid = ''

  agent.subscribe((event: AgentEvent) => {
    const cb = sessions.get(sessionId)?.streamCbs
    if (!cb) return

    switch (event.type) {
      case 'message_start': {
        const msg = event.message as any
        if (msg.role === 'assistant') pid = nextID()
        break
      }
      case 'message_update': {
        const ev = event.assistantMessageEvent
        if (ev.type === 'text_delta') {
          cb.onDelta(pid, ev.delta)
        }
        break
      }
      case 'agent_end': {
        cb.onDone()
        break
      }
    }
  })

  return agent
}

export function subscribeStream(
  sessionId: string,
  callbacks: PiStreamCallbacks,
): () => void {
  let session = sessions.get(sessionId)
  if (!session) {
    const agent = buildAgent(sessionId)
    if (!agent) return () => {} // model not found, no-op
    session = { agent, streamCbs: callbacks }
    sessions.set(sessionId, session)
  } else {
    session.streamCbs = callbacks
  }
  return () => {
    const s = sessions.get(sessionId)
    if (s) s.streamCbs = null
  }
}

export interface PromptResult {
  text: string
  error?: string
}

export async function prompt(
  sessionId: string,
  content: string,
  options?: { systemPrompt?: string; providerID?: string; modelID?: string },
): Promise<PromptResult> {
  let session = sessions.get(sessionId)

  if (!session) {
    const agent = buildAgent(sessionId, options)
    if (!agent) {
      return { text: '', error: `Model "${options?.modelID}" not found. Try a supported provider/model combination.` }
    }
    session = { agent, streamCbs: null }
    sessions.set(sessionId, session)
  } else {
    if (options?.providerID && options?.modelID) {
      const m = getModel(options.providerID as any, options.modelID as any)
      if (m) {
        session.agent.state.model = m
      } else {
        return {
          text: '',
          error: `Model "${options.modelID}" not found for provider "${options.providerID}". Check the model name or try a different provider.`,
        }
      }
    }
    if (options?.systemPrompt) {
      session.agent.state.systemPrompt = options.systemPrompt
    }
  }

  try {
    await session.agent.prompt(content)
  } catch (err) {
    return {
      text: '',
      error: err instanceof Error ? err.message : String(err),
    }
  }

  const messages = session.agent.state.messages
  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
  const text = extractMessageText(lastAssistant)

  return { text }
}

export function abortSession(sessionId: string): void {
  sessions.get(sessionId)?.agent.abort()
}

export function resetSession(sessionId: string): void {
  sessions.get(sessionId)?.agent.reset()
}

export function removeSession(sessionId: string): void {
  const s = sessions.get(sessionId)
  if (s) {
    s.agent.abort()
    sessions.delete(sessionId)
  }
}
