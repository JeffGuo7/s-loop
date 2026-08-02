import { describe, expect, it } from 'vitest'
import {
  assembleAgentRuntimePrompt,
  formatAgentSkillsBlock,
} from '../src/utils/agentRuntime'

describe('agent runtime prompt', () => {
  it('places enabled skills in the system prompt once', () => {
    const skills = formatAgentSkillsBlock([{
      name: 'review',
      description: 'Review code',
      content: 'Check correctness before answering.',
      location: 'skills/review/SKILL.md',
      enabled: true,
    }])

    const prompt = assembleAgentRuntimePrompt('## Identity\nYou are S-Loop.', skills)

    expect(prompt).toContain('## Identity')
    expect(prompt).toContain('## Active Skills')
    expect(prompt.match(/Check correctness before answering\./g)).toHaveLength(1)
  })

  it('does not emit an empty skills section', () => {
    expect(formatAgentSkillsBlock([])).toBeUndefined()
    expect(assembleAgentRuntimePrompt('base', undefined)).toBe('base')
  })
})
