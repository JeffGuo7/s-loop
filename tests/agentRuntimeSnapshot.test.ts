import { describe, expect, it } from 'vitest'
import type { Agent } from '../src/types/agent'
import { buildAgentRuntimeSnapshot } from '../src/utils/agentRuntime'

function makeAgent(): Agent {
  return {
    id: 'agent-reviewer',
    name: 'Reviewer',
    description: 'Reviews work',
    avatar: 'bot',
    instructions: 'Review carefully.',
    identity: 'You are a reviewer.',
    soul: 'Be candid and calm.',
    rules: 'Never invent results.',
    memory: '',
    conversationMode: 'work',
    model: 'deepseek-reasoner',
    skills: ['review', 'unused'],
    mcpTools: [{ serverName: 'github', toolName: 'get_pull_request' }],
    mcpServers: [],
    workspaceRoots: [{
      id: 'root-1',
      path: 'C:\\workspace',
      access: 'read',
      primary: true,
      source: 'task',
    }],
    permissionMode: 'ask',
    permissionRules: { read: 'allow', edit: 'deny' },
    slashCommands: [],
    createdAt: 1,
    updatedAt: 1,
  }
}

describe('task agent runtime snapshot', () => {
  it('captures the selected Soul, skills, permissions, workspace, model and MCP scope', () => {
    const snapshot = buildAgentRuntimeSnapshot(makeAgent(), [
      { name: 'review', description: 'Review code', content: 'Check evidence.', location: '', enabled: true },
      { name: 'unused', description: '', content: 'Do not include.', location: '', enabled: true },
    ], 'The user prefers concise reports.', ['review'])

    expect(snapshot.agentId).toBe('agent-reviewer')
    expect(snapshot.agentName).toBe('Reviewer')
    expect(snapshot.agentSystemPrompt).toContain('Be candid and calm.')
    expect(snapshot.agentSkillsBlock).toContain('Check evidence.')
    expect(snapshot.agentSkillsBlock).not.toContain('Do not include.')
    expect(snapshot.permissionRules).toEqual({ read: 'allow', edit: 'deny' })
    expect(snapshot.workspaceRoots?.[0].access).toBe('read')
    expect(snapshot.agentModel).toBe('deepseek-reasoner')
    expect(snapshot.agentMcpTools).toEqual([{ serverName: 'github', toolName: 'get_pull_request' }])
  })

  it('uses an explicit empty MCP scope for a task without a configured agent', () => {
    const snapshot = buildAgentRuntimeSnapshot(null, [], '', [])
    expect(snapshot.agentName).toBe('Default Assistant')
    expect(snapshot.agentMcpServers).toEqual([])
    expect(snapshot.agentMcpTools).toEqual([])
  })
})
