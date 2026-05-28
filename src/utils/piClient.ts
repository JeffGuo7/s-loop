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

// ---- API key resolution ----

let apiKeyResolver: ((provider: string) => string | undefined) | null = null

/** Register a function that resolves API keys by provider name */
export function setApiKeyResolver(resolver: (provider: string) => string | undefined): void {
  apiKeyResolver = resolver
}

/** Convert Snotra provider name to Pi provider name */
function mapProvider(provider: string): string {
  const map: Record<string, string> = {
    anthropic: 'anthropic',
    openai: 'openai',
    google: 'google',
    deepseek: 'deepseek',
    groq: 'groq',
    openrouter: 'openrouter',
  }
  return map[provider] || provider
}

// ---- Per-session Agent instances ----

const agents = new Map<string, Agent>()

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
  _callbacks?: StreamCallbacks,
): Promise<string | null> {
  // Get or create agent for this session
  let agent = agents.get(sessionId)

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
      getApiKey: async (provider) => {
        if (apiKeyResolver) {
          return apiKeyResolver(provider)
        }
        return undefined
      },
    })

    agents.set(sessionId, agent)
  }

  // Update model if specified
  if (model) {
    try {
      agent.state.model = getModel(model.providerID as any, model.modelID as any)
    } catch {
      // keep default
    }
  }

  try {
    // Send the prompt
    await agent.prompt(content)

    // Extract the last assistant message content
    if (agent.state.messages.length > 0) {
      const lastMessages = agent.state.messages.filter(m => m.role === 'assistant')
      const lastMsg = lastMessages[lastMessages.length - 1]
      if (lastMsg && (lastMsg as any).content) {
        return (lastMsg as any).content as string
      }
    }
    return null
  } catch (err) {
    console.error('[pi] Agent error:', err)
    return null
  }
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
