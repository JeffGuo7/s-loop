import { describe, expect, it } from 'vitest'
import {
  providerCredentialName,
  redactProviderConfigs,
  webSearchCredentialName,
} from '../src/utils/credentialVault'

describe('credential vault helpers', () => {
  it('removes API keys from persisted provider config without mutating runtime state', () => {
    const configs = {
      deepseek: {
        apiKey: 'secret-key',
        model: 'deepseek-chat',
        baseUrl: 'https://example.test',
      },
    }

    const persisted = redactProviderConfigs(configs)

    expect(persisted.deepseek.apiKey).toBe('')
    expect(persisted.deepseek.model).toBe('deepseek-chat')
    expect(configs.deepseek.apiKey).toBe('secret-key')
  })

  it('uses separate namespaces for model and web-search credentials', () => {
    expect(providerCredentialName('deepseek')).toBe('provider:deepseek')
    expect(webSearchCredentialName('tavily')).toBe('websearch:tavily')
  })
})
