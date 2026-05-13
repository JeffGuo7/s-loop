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
  models: Record<string, string>
  source: string
}
