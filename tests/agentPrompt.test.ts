import { describe, expect, it } from 'vitest'
import {
  assembleAgentSystemPrompt,
  createAgentProfile,
  migrateAgentProfile,
} from '../src/utils/agentPrompt'

describe('agent soul runtime', () => {
  it('assembles one ordered system prompt from the durable profile', () => {
    const agent = {
      id: 'agent_test',
      name: 'Lumi',
      description: 'A grounded collaborator',
      ...createAgentProfile('Lumi', 'A grounded collaborator'),
      rules: 'Ask before destructive actions.',
      identity: 'You are Lumi, an AI collaborator.',
      soul: 'Be warm, candid, and specific.',
      memory: 'The user prefers concise Chinese answers.',
      conversationMode: 'companion' as const,
    }

    const prompt = assembleAgentSystemPrompt(agent, {
      userProfile: 'Call the user 老郭.',
      voice: true,
    })

    const sections = [
      '## Rules',
      '## Identity',
      '## Soul',
      '## User',
      '## Reviewed Memory',
      '## Conversation Mode',
      '## Voice Channel',
    ]
    let previous = -1
    for (const section of sections) {
      const current = prompt.indexOf(section)
      expect(current).toBeGreaterThan(previous)
      previous = current
    }
    expect(prompt).toContain('Do not claim to be human')
    expect(prompt).toContain('Do not use emoji')
  })

  it('migrates legacy instructions into rules without losing them', () => {
    const migrated = migrateAgentProfile({
      id: 'legacy',
      name: 'Legacy',
      description: 'Old agent',
      instructions: 'Always cite sources.',
    })

    expect(migrated.rules).toBe('Always cite sources.')
    expect(migrated.identity).toContain('Legacy')
    expect(migrated.soul.length).toBeGreaterThan(20)
    expect(migrated.memory).toBe('')
    expect(migrated.conversationMode).toBe('natural')
  })
})
