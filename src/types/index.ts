// OpenCode API types matching @opencode-ai/sdk

// ----- Message Parts -----

export interface TextPart {
  id: string
  sessionID?: string
  messageID?: string
  type: 'text'
  text: string
  time?: { created?: number; completed?: number }
}

export interface ReasoningPart {
  id: string
  sessionID: string
  messageID: string
  type: 'reasoning'
  text: string
  time: { created: number; completed?: number }
}

export type ToolState =
  | { status: 'pending' }
  | { status: 'running' }
  | { status: 'completed'; output?: string }
  | { status: 'error'; error?: string }

export interface ToolPart {
  id: string
  sessionID: string
  messageID: string
  type: 'tool'
  callID: string
  tool: string
  name?: string
  state: ToolState
  args?: unknown
  result?: unknown
  time?: { created?: number; completed?: number }
}

export interface StepStartPart {
  id: string
  sessionID: string
  messageID: string
  type: 'step-start'
  snapshot?: unknown
  time?: { created?: number }
}

export interface StepFinishPart {
  id: string
  sessionID: string
  messageID: string
  type: 'step-finish'
  reason?: string
  cost?: number
  tokens?: { input?: number; output?: number }
  time?: { created?: number; completed?: number }
}

export interface FilePart {
  id: string
  sessionID: string
  messageID: string
  type: 'file'
  mime: string
  url: string
  filename?: string
  time?: { created?: number }
}

export type MessagePart = TextPart | ReasoningPart | ToolPart | StepStartPart | StepFinishPart | FilePart

// ----- Message -----

export interface MessageInfo {
  id: string
  sessionID: string
  role: 'user' | 'assistant'
  time: { created: number; completed?: number }
  cost?: number
  tokens?: { input?: number; output?: number }
}

export interface KiloMessage {
  info: MessageInfo
  parts: MessagePart[]
}

// ----- SSE Events -----

export interface SSEPartUpdatedEvent {
  type: 'message.part.updated'
  properties: {
    part: MessagePart
    delta?: string
  }
}

export interface SSEMessageUpdatedEvent {
  type: 'message.updated'
  properties: {
    info: MessageInfo
  }
}

export interface SSESessionIdleEvent {
  type: 'session.idle'
  properties: {
    sessionID: string
  }
}

export interface SSESessionStatusEvent {
  type: 'session.status'
  properties: {
    sessionID: string
    status: 'idle' | 'busy'
  }
}

export interface SSErrorEvent {
  type: 'session.error'
  properties: {
    sessionID: string
    error: { message: string }
  }
}

export interface SSEServerConnectedEvent {
  type: 'server.connected'
}

export interface SSEServerHeartbeatEvent {
  type: 'server.heartbeat'
}

export type SSEEvent =
  | SSEPartUpdatedEvent
  | SSEMessageUpdatedEvent
  | SSESessionIdleEvent
  | SSESessionStatusEvent
  | SSErrorEvent
  | SSEServerConnectedEvent
  | SSEServerHeartbeatEvent

// ----- Session -----

export interface Session {
  id: string
  title: string
  kiloId?: string
  piId?: string
  model?: string
  source?: 'local' | 'platform'
  platformId?: 'telegram' | 'feishu' | 'dingtalk' | 'wechat'
  sourceLabel?: string
  readOnly?: boolean
  createdAt: number
  updatedAt: number
}

// ----- Provider -----

export interface ProviderConfig {
  apiKey: string
  model: string
  baseUrl: string
  supportsVision?: boolean
}

export interface ProviderInfo {
  id: string
  name: string
  source?: string
  env?: string | string[]
  api?: string
  isCustom?: boolean
  models?: Record<string, { id: string; name: string }>
}

// ----- Companion -----

export interface Companion {
  name: string
  type: string
  level: number
  xp: number
  mood: number
  hatchedAt: number
}
