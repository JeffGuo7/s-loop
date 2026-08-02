import { describe, expect, it } from 'vitest'
import type { PlatformConfig } from '../src/types/platform'
import {
  platformCredentialName,
  splitPlatformValues,
} from '../src/utils/platformConfigSecurity'

describe('platform config security', () => {
  it('separates passwords and credential-bearing webhook URLs', () => {
    const platform: PlatformConfig = {
      id: 'slack',
      name: 'Slack',
      icon: 'MessageSquare',
      description: '',
      enabled: false,
      connected: false,
      fields: [
        { key: 'webhookUrl', label: 'Webhook', type: 'text', placeholder: '', required: false },
        { key: 'botToken', label: 'Token', type: 'password', placeholder: '', required: false },
        { key: 'channelId', label: 'Channel', type: 'text', placeholder: '', required: false },
      ],
      values: {},
    }

    const split = splitPlatformValues(platform, {
      webhookUrl: 'https://hooks.example/secret',
      botToken: 'xoxb-secret',
      channelId: 'C123',
    })

    expect(split.secrets).toEqual({
      webhookUrl: 'https://hooks.example/secret',
      botToken: 'xoxb-secret',
    })
    expect(split.publicValues).toEqual({ channelId: 'C123' })
    expect(platformCredentialName('slack')).toBe('platform:slack')
  })
})
