import { useAgentStore } from '../stores/agentStore'
import { useSkillStore } from '../stores/skillStore'
import type { Agent, AgentMCPTool, WorkspaceRoot } from '../types/agent'
import type { SkillInfo } from '../types/skill'
import type { TaskAgentRuntime } from '../types/task'
import { assembleAgentSystemPrompt } from './agentPrompt'

/**
 * Runtime config derived from the active agent, synced to the backend so
 * that autonomous, backend-driven flows (platform inbound replies, cron
 * tasks) can honor the same agent instructions, skills, and permissions
 * that the chat UI applies per message.
 *
 * Remote MCP selections are included as an authority boundary. The sidecar
 * can execute connected remote MCP tools headlessly, but only inside the
 * mounted server/tool scope captured here.
 */
export interface AgentRuntimeConfig {
  agentSystemPrompt?: string
  agentSkillsBlock?: string
  agentModel?: string
  permissionMode?: string
  permissionRules?: Record<string, unknown>
  workspaceRoots?: WorkspaceRoot[]
  agentMcpServers?: string[]
  agentMcpTools?: AgentMCPTool[]
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

export function buildAgentRuntimeSnapshot(
  agent: Agent | null,
  availableSkills: SkillInfo[],
  userProfile: string,
  selectedSkillNames?: string[],
): TaskAgentRuntime {
  const skillNames = selectedSkillNames ?? (agent
    ? agent.skills
    : availableSkills.filter((skill) => skill.enabled).map((skill) => skill.name))
  const enabledSkills = skillNames
    .map((name) => availableSkills.find((skill) => skill.name === name))
    .filter((skill): skill is SkillInfo => Boolean(skill?.enabled))

  return {
    agentId: agent?.id,
    agentName: agent?.name || 'Default Assistant',
    agentSystemPrompt: agent
      ? assembleAgentSystemPrompt(agent, { userProfile })
      : undefined,
    agentSkillsBlock: formatAgentSkillsBlock(enabledSkills),
    agentModel: agent?.model || undefined,
    permissionMode: agent?.permissionMode,
    permissionRules: agent?.permissionRules ? { ...agent.permissionRules } : undefined,
    workspaceRoots: agent?.workspaceRoots.map((root) => ({ ...root })) || [],
    agentMcpServers: agent ? [...agent.mcpServers] : [],
    agentMcpTools: agent ? agent.mcpTools.map((tool) => ({ ...tool })) : [],
    capturedAt: Date.now(),
  }
}

export function buildAgentRuntimeConfig(): AgentRuntimeConfig {
  const agentStore = useAgentStore.getState()
  const activeAgent = agentStore.activeAgentId
    ? agentStore.agents.find((a) => a.id === agentStore.activeAgentId)
    : null

  const skillStore = useSkillStore.getState()
  const snapshot = buildAgentRuntimeSnapshot(
    activeAgent || null,
    skillStore.skills,
    agentStore.userProfile,
  )

  return {
    agentSystemPrompt: snapshot.agentSystemPrompt,
    agentSkillsBlock: snapshot.agentSkillsBlock,
    agentModel: snapshot.agentModel,
    permissionMode: snapshot.permissionMode,
    permissionRules: snapshot.permissionRules,
    workspaceRoots: snapshot.workspaceRoots,
    agentMcpServers: activeAgent ? snapshot.agentMcpServers : undefined,
    agentMcpTools: activeAgent ? snapshot.agentMcpTools : undefined,
  }
}
