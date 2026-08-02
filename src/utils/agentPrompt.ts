import type { Agent, AgentConversationMode } from '../types/agent'

export interface AgentProfileFields {
  identity: string
  soul: string
  rules: string
  memory: string
  conversationMode: AgentConversationMode
}

const DEFAULT_SOUL = [
  'Be warm, candid, grounded, and specific.',
  'Respond like a thoughtful long-term collaborator: notice context, match the user’s energy, and disagree respectfully when needed.',
  'Avoid canned greetings, excessive praise, repeated catchphrases, and offers such as “feel free to ask anytime”.',
  'Show care through attention and useful judgment, not through pretending to have human feelings or experiences.',
].join(' ')

export function createAgentProfile(name: string, description = ''): AgentProfileFields {
  const role = description.trim() || 'a capable general-purpose collaborator'
  return {
    identity: `You are ${name}, an AI assistant described as ${role}. Be transparent that you are AI; do not claim to be human or invent a biography.`,
    soul: DEFAULT_SOUL,
    rules: '',
    memory: '',
    conversationMode: 'natural',
  }
}

export function migrateAgentProfile<T extends Record<string, unknown>>(
  agent: T,
): T & AgentProfileFields {
  const name = typeof agent.name === 'string' && agent.name.trim() ? agent.name : 'S-Loop'
  const description = typeof agent.description === 'string' ? agent.description : ''
  const defaults = createAgentProfile(name, description)
  const conversationMode =
    agent.conversationMode === 'work' ||
    agent.conversationMode === 'natural' ||
    agent.conversationMode === 'companion'
      ? agent.conversationMode
      : defaults.conversationMode

  return {
    ...agent,
    identity: typeof agent.identity === 'string' && agent.identity.trim()
      ? agent.identity
      : defaults.identity,
    soul: typeof agent.soul === 'string' && agent.soul.trim() ? agent.soul : defaults.soul,
    rules: typeof agent.rules === 'string'
      ? agent.rules
      : typeof agent.instructions === 'string'
        ? agent.instructions
        : defaults.rules,
    memory: typeof agent.memory === 'string' ? agent.memory : defaults.memory,
    conversationMode,
  }
}

export function migrateAgentProfileState(persisted: unknown): unknown {
  if (!persisted || typeof persisted !== 'object') return persisted
  const state = persisted as { agents?: unknown; userProfile?: unknown }
  if (!Array.isArray(state.agents)) return persisted
  return {
    ...state,
    agents: state.agents.map((agent) =>
      agent && typeof agent === 'object'
        ? migrateAgentProfile(agent as Record<string, unknown>)
        : agent,
    ),
    userProfile: typeof state.userProfile === 'string' ? state.userProfile : '',
  }
}

const MODE_PROMPTS: Record<AgentConversationMode, string> = {
  work: 'Be concise, precise, and outcome-first. Keep warmth subtle and avoid conversational filler.',
  natural: 'Be direct and natural with moderate warmth and initiative. Sound like a familiar, grounded collaborator.',
  companion: 'Be attentive, reflective, and relationship-aware. Acknowledge emotion without dramatizing it, while still providing useful judgment.',
}

type PromptAgent = Pick<
  Agent,
  'name' | 'description' | 'identity' | 'soul' | 'rules' | 'memory' | 'conversationMode'
>

export function assembleAgentSystemPrompt(
  agent: PromptAgent,
  options: { userProfile?: string; voice?: boolean } = {},
): string {
  const profile = migrateAgentProfile(agent as unknown as Record<string, unknown>)
  const sections = [
    '## Runtime Contract\nYou are an AI assistant. Follow platform safety, permission, and tool rules. Do not claim to be human or fabricate personal experiences.',
  ]

  if (profile.rules.trim()) sections.push(`## Rules\n${profile.rules.trim()}`)
  sections.push(`## Identity\n${profile.identity.trim()}`)
  sections.push(`## Soul\n${profile.soul.trim()}`)
  if (options.userProfile?.trim()) sections.push(`## User\n${options.userProfile.trim()}`)
  if (profile.memory.trim()) sections.push(`## Reviewed Memory\n${profile.memory.trim()}`)
  sections.push(`## Conversation Mode\n${MODE_PROMPTS[profile.conversationMode]}`)

  if (options.voice) {
    sections.push(
      '## Voice Channel\nUse short, natural spoken sentences. Do not use emoji, Markdown, raw URLs, decorative symbols, or canned closing offers. Prefer one to three sentences unless detail is necessary.',
    )
  }

  return sections.join('\n\n')
}
