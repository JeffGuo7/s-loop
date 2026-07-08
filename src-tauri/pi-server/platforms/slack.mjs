/**
 * Slack adapter. Inbound via webhook with signing secret verification.
 * Outbound via Incoming Webhook URL or chat.postMessage API.
 */
import { postJson, constantTimeEqual } from './base.mjs'
import { createHmac } from 'node:crypto'

function verifySlackSignature(rawBody, headers, signingSecret) {
  if (!signingSecret) return { ok: true } // not configured, skip
  const ts = headers['x-slack-request-timestamp']
  const sig = headers['x-slack-signature']
  if (!ts || !sig) return { ok: false, error: '缺少 Slack 签名头' }

  // Replay protection: 5 min window
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) {
    return { ok: false, error: '请求时间戳过期' }
  }

  const base = `v0:${ts}:${rawBody}`
  const hmac = createHmac('sha256', signingSecret).update(base).digest('hex')
  if (!constantTimeEqual(`v0=${hmac}`, sig)) {
    return { ok: false, error: 'Slack 签名校验失败' }
  }
  return { ok: true }
}

export default {
  id: 'slack',
  inboundMode: 'webhook',
  maxLength: 3000,

  async validateConnection(platform) {
    const hookUrl = platform.values.webhookUrl?.trim()
    if (hookUrl) return // webhook-only mode
    const token = platform.values.botToken?.trim()
    if (!token) throw new Error('需要配置 Slack Webhook URL 或 Bot Token')
  },

  async dispatch(platform, text) {
    // Prefer Bot Token (chat.postMessage) over webhook for richer features
    const token = platform.values.botToken?.trim()
    const channel = platform.values.channelId?.trim() || platform.values.channel?.trim()
    if (token && channel) {
      await postJson('https://slack.com/api/chat.postMessage', {
        channel,
        text,
        mrkdwn: true,
      }, { Authorization: `Bearer ${token}` })
      return
    }
    // Fallback: Incoming Webhook
    const hookUrl = platform.values.webhookUrl?.trim()
    if (hookUrl) {
      await postJson(hookUrl, { text, mrkdwn: true })
      return
    }
    throw new Error('Slack: 需要 Bot Token + Channel 或 Webhook URL')
  },

  verifyInbound(rawBody, _payload, headers, platform) {
    return verifySlackSignature(rawBody, headers, platform.values.signingSecret?.trim())
  },

  normalizeInbound(payload) {
    // Slack Events API payload
    if (payload.type === 'url_verification') {
      return { challenge: payload.challenge }
    }
    // Event callback
    const event = payload.event || {}
    const text = event.text || payload.text || ''
    if (!text.trim()) return null
    // Skip bot messages to avoid loops
    if (event.bot_id || event.subtype === 'bot_message') return null
    return {
      platformId: 'slack',
      conversationId: event.channel || payload.channel || '',
      chatId: event.channel || payload.channel || '',
      threadId: event.thread_ts || null,
      messageId: event.event_ts || payload.event_ts || Date.now(),
      text: text.trim(),
      username: event.user || payload.user || '',
    }
  },
}
