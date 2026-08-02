import { describe, expect, it } from 'vitest'
import {
  getReasoningPreference,
  setReasoningPreference,
  type ModelReasoningCapabilities,
} from '../src/utils/reasoning'
import type { ProviderConfig } from '../src/types'

const deepSeekCapabilities: ModelReasoningCapabilities = {
  reasoning: true,
  supportedThinkingLevels: ['off', 'high', 'max'],
  recommendedThinkingLevel: 'high',
}

const baseConfig: ProviderConfig = {
  apiKey: '',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-pro',
}

describe('reasoning preferences', () => {
  it('uses the model recommendation when no preference exists', () => {
    expect(getReasoningPreference(baseConfig, 'deepseek-v4-pro', deepSeekCapabilities)).toBe('high')
  })

  it('restores a supported preference for the selected model', () => {
    const config = {
      ...baseConfig,
      reasoningEfforts: { 'deepseek-v4-pro': 'max' as const },
    }

    expect(getReasoningPreference(config, 'deepseek-v4-pro', deepSeekCapabilities)).toBe('max')
  })

  it('falls back when a stored preference is unsupported by the model', () => {
    const config = {
      ...baseConfig,
      reasoningEfforts: { 'deepseek-v4-pro': 'medium' as const },
    }

    expect(getReasoningPreference(config, 'deepseek-v4-pro', deepSeekCapabilities)).toBe('high')
  })

  it('updates one model without losing preferences for other models', () => {
    const config = {
      ...baseConfig,
      reasoningEfforts: { 'deepseek-v4-flash': 'off' as const },
    }

    expect(setReasoningPreference(config, 'deepseek-v4-pro', 'max').reasoningEfforts).toEqual({
      'deepseek-v4-flash': 'off',
      'deepseek-v4-pro': 'max',
    })
  })
})
