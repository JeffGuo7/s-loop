import { describe, expect, it } from 'vitest'
import {
  assembleAgentSystemPrompt,
  createAgentProfile,
  migrateAgentProfile,
  selectReviewedMemories,
} from '../src/utils/agentPrompt'
import type { AgentMemoryEntry } from '../src/types/agent'

function memory(overrides: Partial<AgentMemoryEntry>): AgentMemoryEntry {
  return {
    id: overrides.id || 'memory-1',
    content: overrides.content || 'Remember this.',
    scope: overrides.scope || 'agent',
    status: overrides.status || 'candidate',
    source: overrides.source || 'manual',
    createdAt: overrides.createdAt || 1,
    workspacePath: overrides.workspacePath,
    reviewedAt: overrides.reviewedAt,
  }
}

describe('reviewed agent memory lifecycle', () => {
  it('injects only approved memories whose scope matches the active workspace', () => {
    const memories = [
      memory({ id: 'candidate', content: 'Candidate secret', status: 'candidate' }),
      memory({ id: 'agent', content: 'Use concise reports', status: 'approved' }),
      memory({
        id: 'workspace-match',
        content: 'This project uses pnpm',
        status: 'approved',
        scope: 'workspace',
        workspacePath: 'C:\\Projects\\S-Loop',
      }),
      memory({
        id: 'workspace-other',
        content: 'Other project fact',
        status: 'approved',
        scope: 'workspace',
        workspacePath: 'C:\\Projects\\Other',
      }),
      memory({ id: 'rejected', content: 'Rejected fact', status: 'rejected' }),
    ]

    expect(selectReviewedMemories({ memories }, 'c:/projects/s-loop/').map((item) => item.id))
      .toEqual(['agent', 'workspace-match'])

    const profile = createAgentProfile('S-Loop')
    const prompt = assembleAgentSystemPrompt({
      name: 'S-Loop',
      description: '',
      ...profile,
      memories,
    }, { workspaceDir: 'C:/Projects/S-Loop' })
    expect(prompt).toContain('Use concise reports')
    expect(prompt).toContain('This project uses pnpm')
    expect(prompt).not.toContain('Candidate secret')
    expect(prompt).not.toContain('Other project fact')
    expect(prompt).not.toContain('Rejected fact')
  })

  it('migrates malformed legacy entries safely while preserving reviewed memory text', () => {
    const migrated = migrateAgentProfile({
      name: 'Legacy',
      memory: 'Existing reviewed note',
      memories: [
        { id: 'valid', content: '  Valid candidate  ', status: 'unknown' },
        { id: 'empty', content: '   ' },
      ],
    })

    expect(migrated.memory).toBe('Existing reviewed note')
    expect(migrated.memories).toHaveLength(1)
    expect(migrated.memories[0]).toMatchObject({
      id: 'valid',
      content: 'Valid candidate',
      status: 'candidate',
      scope: 'agent',
    })
  })
})
