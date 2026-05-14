export interface Session {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  kiloId?: string
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface ProviderConfig {
  apiKey: string
  model: string
  baseUrl?: string
}

export type ProviderKind = 'anthropic' | 'openai'

export interface Companion {
  name: string
  personality: string
  species: string
  rarity: string
  hatchedAt: number
}

// Kilo-backed provider info (from /provider API)
export interface ProviderInfo {
  id: string
  name: string
  env: string
  models: Record<string, { id: string; name: string }>
  source: string
}

// ============================================
// Kilo Message Part Types
// ============================================

/** Tool execution state */
export type ToolState = 'pending' | 'running' | 'completed' | 'error'

/** Text content part */
export interface TextPart {
  id: string
  type: 'text'
  text: string
  time?: { start?: number; end?: number }
}

/** Reasoning/thinking part */
export interface ReasoningPart {
  id: string
  type: 'reasoning'
  text: string
  time?: { start?: number; end?: number }
}

/** Tool invocation part */
export interface ToolPart {
  id: string
  type: 'tool'
  callID: string
  tool: string
  state: ToolState
  input?: Record<string, unknown>
  output?: string
  error?: string
  title?: string
  time?: { start?: number; end?: number }
}

/** Step start marker */
export interface StepStartPart {
  id: string
  type: 'step-start'
}

/** Step finish marker */
export interface StepFinishPart {
  id: string
  type: 'step-finish'
  reason: string
  tokens?: {
    input: number
    output: number
    reasoning: number
    cache?: { read: number; write: number }
  }
  cost?: number
}

/** File attachment part */
export interface FilePart {
  id: string
  type: 'file'
  mime: string
  url: string
  filename?: string
}

/** Union of all message part types */
export type MessagePart = TextPart | ReasoningPart | ToolPart | StepStartPart | StepFinishPart | FilePart

/** Message metadata */
export interface MessageInfo {
  id: string
  sessionID: string
  role: 'user' | 'assistant'
  time: {
    created: number
    completed?: number
  }
  modelID?: string
  providerID?: string
  cost?: number
  tokens?: {
    input: number
    output: number
    reasoning: number
    cache?: { read: number; write: number }
  }
  finish?: 'stop' | 'tool-calls' | 'error' | 'unknown'
  error?: { message: string }
}

/** Full Kilo message with parts */
export interface KiloMessage {
  info: MessageInfo
  parts: MessagePart[]
}

// ============================================
// SSE Event Types
// ============================================

export interface SSEPartUpdatedEvent {
  type: 'message.part.updated'
  sessionID: string
  messageID: string
  partID: string
  part: MessagePart
}

export interface SSEPartDeltaEvent {
  type: 'message.part.delta'
  sessionID: string
  messageID: string
  partID: string
  field: 'text'
  delta: string
}

export interface SSEMessageUpdatedEvent {
  type: 'message.updated'
  sessionID: string
  messageID: string
  info: MessageInfo
}

export interface SSESessionErrorEvent {
  type: 'session.error'
  error: { message: string }
}

export type SSEEvent =
  | SSEPartUpdatedEvent
  | SSEPartDeltaEvent
  | SSEMessageUpdatedEvent
  | SSESessionErrorEvent
  | { type: 'server.connected' }
  | { type: 'server.heartbeat' }
