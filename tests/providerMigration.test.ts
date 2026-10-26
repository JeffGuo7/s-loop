import { describe, expect, it } from 'vitest'
import { clearLegacyOpenCodeGateways } from '../src/utils/providerMigration'
import type { ProviderConfig } from '../src/types'

const config = (baseUrl: string): ProviderConfig => ({
  apiKey: 'key',
  model: 'model',
  baseUrl,
  supportsVision: true,
})

describe('clearLegacyOpenCodeGateways', () => {
  it('clears only the stale OpenCode gateways and keeps everything else', () => {
    const anthropic = config('https://api.anthropic.com')
    const configs = {
      anthropic,
      opencode: config('https://api.opencode.ai/v1'),
      'opencode-go': config('https://opencode.ai/zen/go/v1'),
      deepseek: config('https://api.deepseek.com'),
    }

    const next = clearLegacyOpenCodeGateways(configs)

    expect(next).not.toBe(configs)
    expect(next.anthropic).toBe(anthropic)
    expect(next.deepseek).toBe(configs.deepseek)
    expect(next.opencode.baseUrl).toBe('')
    expect(next['opencode-go'].baseUrl).toBe('')
    expect(next['opencode-go'].model).toBe('model')
  })

  it('returns the input when there is nothing to migrate', () => {
    const configs = {
      'opencode-go': config('https://opencode.ai/inference/go'),
    }
    expect(clearLegacyOpenCodeGateways(configs)).toBe(configs)
  })
})
