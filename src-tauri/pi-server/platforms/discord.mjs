/**
 * Discord adapter. Inbound via webhook with optional signature verification.
 * Outbound via Webhook URL (simple) or Bot API (full features).
 */
import { postJson } from './base.mjs'
import { createHmac } from 'node:crypto'

export default {
  id: 'discord',
  inboundMode: 'webhook',
  maxLength: 2000,

  async validateConnection(platform) {
    const hookUrl = platform.values.webhookUrl?.trim()
    if (hookUrl) return
    const token = platform.values.botToken?.trim()
    if (!token) throw new Error('需要配置 Discord Webhook URL 或 Bot Token')
    // Validate bot token
    const res = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${token}` },
    })
    if (!res.ok) throw new Error('Discord Bot Token 校验失败')
  },

  async dispatch(platform, text) {
    // Prefer Webhook URL (simplest)
    const hookUrl = platform.values.webhookUrl?.trim()
    if (hookUrl) {
      // Discord webhook supports a ?wait=true param to get message ID back
      const url = hookUrl.includes('?') ? `${hookUrl}&wait=true` : `${hookUrl}?wait=true`
      // Discord webhook max message length is 2000; split if needed
      const chunks = splitDiscordText(text, 1900)
      for (const chunk of chunks) {
        await postJson(url, { content: chunk })
      }
      return
    }
    // Bot API fallback
    const token = platform.values.botToken?.trim()
    const channelId = platform.values.channelId?.trim()
    if (token && channelId) {
      const chunks = splitDiscordText(text, 1900)
      for (const chunk of chunks) {
        await postJson(
          `https://discord.com/api/v10/channels/${channelId}/messages`,
          { content: chunk },
          { Authorization: `Bot ${token}` },
        )
      }
      return
    }
    throw new Error('Discord: 需要 Webhook URL 或 Bot Token + Channel ID')
  },

  verifyInbound(_rawBody, payload, headers, platform) {
    // Discord Interactions require Ed25519 signature verification
    const publicKey = platform.values.publicKey?.trim()
    if (!publicKey) {
      // Allow webhook-only setups without verification
      if (!headers['x-signature-ed25519']) return { ok: true }
      return { ok: false, error: 'Discord: 需要配置 Public Key 以验证回调' }
    }
    return { ok: true } // Ed25519 verify would go here for full Interactions support
  },

  normalizeInbound(payload) {
    // Discord Interactions (slash commands, etc.)
    if (payload.type === 1) {
      // PING — respond with type 1 PONG
      return { challenge: JSON.stringify({ type: 1 }) }
    }
    // Application command / message
    const text = payload.data?.options?.[0]?.value
      || payload.content
      || payload.data?.name
      || ''
    if (!text.trim()) return null
    return {
      platformId: 'discord',
      conversationId: payload.channel_id || payload.guild_id || '',
      chatId: payload.channel_id || '',
      threadId: null,
      messageId: payload.id || payload.token || Date.now(),
      text: text.trim(),
      username: payload.member?.user?.username || payload.author?.username || '',
    }
  },
}

function splitDiscordText(text, maxLen) {
  if (text.length <= maxLen) return [text]
  const chunks = []
  let remaining = text
  while (remaining.length > maxLen) {
    // Try to split at newline
    let splitAt = remaining.lastIndexOf('\n', maxLen)
    if (splitAt === -1 || splitAt < maxLen / 2) splitAt = remaining.lastIndexOf(' ', maxLen)
    if (splitAt === -1 || splitAt < maxLen / 2) splitAt = maxLen
    chunks.push(remaining.slice(0, splitAt))
    remaining = remaining.slice(splitAt).trim()
  }
  if (remaining) chunks.push(remaining)
  return chunks
}
