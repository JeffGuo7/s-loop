/**
 * QQ Bot adapter — QQ Official Bot (QQ开放平台).
 *
 * Auth: AppID + ClientSecret → access_token (OAuth, 7200s TTL)
 * Inbound: WebSocket gateway (wss://api.sgroup.qq.com/websocket)
 * Outbound: REST API (api.sgroup.qq.com)
 *
 * Refs: openclaw/extensions/qqbot, QQ Open Platform docs
 */
import { postJson } from './base.mjs'

const API_BASE = 'https://api.sgroup.qq.com'
const TOKEN_URL = 'https://bots.qq.com/app/getAppAccessToken'
const WS_URL = 'wss://api.sgroup.qq.com/websocket'

// ─── Token cache ──────────────────────────────────────────
const _tokenCache = new Map() // platformId → { token, expiresAt }

async function getAccessToken(platform) {
  const cached = _tokenCache.get(platform.id)
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token

  const appId = platform.values.appId?.trim()
  const clientSecret = platform.values.clientSecret?.trim()
  if (!appId || !clientSecret) throw new Error('QQ Bot: 需要 App ID 和 Client Secret')

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId, clientSecret }),
  })
  const data = await res.json()
  if (!res.ok || !data.access_token) {
    throw new Error(data?.error_description || data?.msg || 'QQ Bot token 获取失败')
  }
  const token = data.access_token
  const expiresAt = Date.now() + ((data.expires_in || 7200) * 1000)
  _tokenCache.set(platform.id, { token, expiresAt })
  return token
}

export default {
  id: 'qqbot',
  inboundMode: 'polling',
  maxLength: 2000,

  async validateConnection(platform) {
    const appId = platform.values.appId?.trim()
    const clientSecret = platform.values.clientSecret?.trim()
    if (!appId || !clientSecret) throw new Error('QQ Bot: 需要配置 App ID 和 Client Secret')
    await getAccessToken(platform)
  },

  async dispatch(platform, text) {
    const token = await getAccessToken(platform)
    const scope = platform.values.chatScope || 'group' // 'c2c' | 'group'
    const targetId = platform.values.targetId?.trim()
      || platform.values.groupId?.trim()
      || platform.values.chatId?.trim()
    if (!targetId) throw new Error('QQ Bot: 需要 Group ID 或 User OpenID')

    const endpoint = scope === 'c2c'
      ? `${API_BASE}/v2/users/${targetId}/messages`
      : `${API_BASE}/v2/groups/${targetId}/messages`

    // QQ Bot supports markdown
    const payload = {
      content: text,
      msg_type: 0,
      markdown: {
        template_id: 0,
        params: [{ key: 'content', values: [text] }],
      },
    }

    await postJson(endpoint, payload, {
      Authorization: `QQBot ${token}`,
    })
  },

  // Polling adapter — inbound handled externally via getAccessToken + gateway
}
