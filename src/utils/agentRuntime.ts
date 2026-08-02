import { useAgentStore } from '../stores/agentStore'
import { useSkillStore } from '../stores/skillStore'
import type { WorkspaceRoot } from '../types/agent'
import type { SkillInfo } from '../types/skill'
import { assembleAgentSystemPrompt } from './agentPrompt'

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
  workspaceRoots?: WorkspaceRoot[]
}

export function formatAgentSkillsBlock(skills: SkillInfo[]): string | undefined {
  if (skills.length === 0) return undefined
  const blocks = skills.map((skill) =>
    skill.content
      ? `<skill name="${skill.name}">\n${skill.description ? `Description: ${skill.description}\n` : ''}${skill.content}\n</skill>`
      : `<skill name="${skill.name}">\n${skill.description || ''}\n</skill>`,
  )
  return '## Active Skills\nThe following skills are activated and their instructions should be followed:\n' +
    blocks.join('\n\n')
}

export function assembleAgentRuntimePrompt(
  agentSystemPrompt?: string,
  agentSkillsBlock?: string,
): string | undefined {
  const sections = [agentSystemPrompt, agentSkillsBlock]
    .map((section) => section?.trim())
    .filter((section): section is string => Boolean(section))
  return sections.length > 0 ? sections.join('\n\n') : undefined
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

  const skillsBlock = formatAgentSkillsBlock(enabledSkills)

  return {
    agentSystemPrompt: activeAgent
      ? assembleAgentSystemPrompt(activeAgent, { userProfile: agentStore.userProfile })
      : undefined,
    agentSkillsBlock: skillsBlock,
    agentModel: activeAgent?.model || undefined,
    permissionMode: activeAgent?.permissionMode,
    permissionRules: activeAgent?.permissionRules,
    workspaceRoots: activeAgent?.workspaceRoots || [],
  }
}
