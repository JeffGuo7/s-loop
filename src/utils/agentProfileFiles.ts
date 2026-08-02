import { invoke } from '@tauri-apps/api/core'
import type { AgentConversationMode } from '../types/agent'
import type { KokoroSpeakerId } from '../config/kokoroVoices'

export interface PersistedAgentProfile {
  id: string
  name: string
  description: string
  identity: string
  soul: string
  rules: string
  memory: string
  conversationMode: AgentConversationMode
}

export async function syncAgentProfileFiles(
  agents: PersistedAgentProfile[],
  userProfile: string,
  speakerId: KokoroSpeakerId,
): Promise<void> {
  await Promise.all(
    agents.map((agent) =>
      invoke<void>('save_agent_profile_files', {
        profile: {
          agentId: agent.id,
          identity: agent.identity,
          soul: agent.soul,
          rules: agent.rules,
          memory: agent.memory,
          userProfile,
          speakerId,
          conversationMode: agent.conversationMode,
        },
      }),
    ),
  )
}
