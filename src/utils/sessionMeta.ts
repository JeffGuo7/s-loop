import type { PlatformId } from '../types/platform'
import type { Session } from '../types'

const PLATFORM_LABELS: Record<PlatformId, string> = {
  telegram: 'Telegram',
  email: 'Email',
  webhook: 'Webhook',
  feishu: '飞书',
  dingtalk: '钉钉',
  wechat: '企业微信',
}

export function parseSessionModel(model?: string | null): {
  source: 'local' | 'platform'
  platformId?: PlatformId
  sourceLabel?: string
  readOnly: boolean
} {
  const value = String(model || '').trim()
  if (value.startsWith('platform:')) {
    const platformId = value.slice('platform:'.length) as PlatformId
    return {
      source: 'platform',
      platformId,
      sourceLabel: PLATFORM_LABELS[platformId] || platformId,
      readOnly: true,
    }
  }

  return {
    source: 'local',
    readOnly: false,
  }
}

export function enrichSession<T extends Pick<Session, 'model'> & Record<string, unknown>>(session: T): T & Session {
  const meta = parseSessionModel(typeof session.model === 'string' ? session.model : '')
  return {
    ...session,
    source: meta.source,
    platformId: meta.platformId,
    sourceLabel: meta.sourceLabel,
    readOnly: meta.readOnly,
  } as T & Session
}
