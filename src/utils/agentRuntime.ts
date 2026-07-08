import { useAgentStore } from '../stores/agentStore'
import { useSkillStore } from '../stores/skillStore'

/**
 * Runtime config derived from the active agent, synced to the backend so
 * that autonomous, backend-driven flows (platform inbound replies, cron
 * tasks) can honor the same agent instructions, skills, and permissions
 * that the chat UI applies per message.
 *
 * MCP tools are intentionally excluded — MCP tool calls proxy through the
 * frontend's live SSE stream, which isn't present for a platform message
 * that arrives while no chat is open. Skills are plain prompt text, so they
 * work headlessly.
 */
export interface AgentRuntimeConfig {
  agentSystemPrompt?: string
  agentSkillsBlock?: string
  agentModel?: string
  permissionMode?: string
  permissionRules?: Record<string, unknown>
}

export function buildAgentRuntimeConfig(): AgentRuntimeConfig {
  const agentStore = useAgentStore.getState()
  const activeAgent = agentStore.activeAgentId
    ? agentStore.agents.find((a) => a.id === agentStore.activeAgentId)
    : null

  const skillStore = useSkillStore.getState()
  const enabledSkills = activeAgent
    ? activeAgent.skills
        .map((n) => skillStore.skills.find((s) => s.name === n))
        .filter((s): s is NonNullable<typeof s> => s !== undefined && s.enabled)
    : skillStore.skills.filter((s) => s.enabled)

  let skillsBlock = ''
  if (enabledSkills.length > 0) {
    const blocks = enabledSkills.map((s) =>
      s.content
        ? `<skill name="${s.name}">\n${s.description ? `Description: ${s.description}\n` : ''}${s.content}\n</skill>`
        : `<skill name="${s.name}">\n${s.description || ''}\n</skill>`,
    )
    skillsBlock =
      '## Active Skills\nThe following skills are activated and their instructions should be followed:\n' +
      blocks.join('\n\n')
  }

  return {
    agentSystemPrompt: activeAgent?.instructions || undefined,
    agentSkillsBlock: skillsBlock || undefined,
    agentModel: activeAgent?.model || undefined,
    permissionMode: activeAgent?.permissionMode,
    permissionRules: activeAgent?.permissionRules,
  }
}
