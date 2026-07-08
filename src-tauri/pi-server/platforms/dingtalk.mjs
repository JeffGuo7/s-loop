/**
 * DingTalk (钉钉) adapter. Outbound webhook is HMAC-signed when a secret
 * is configured. Inbound via webhook with optional token verification.
 */
import { createHmac } from 'node:crypto'
import { postJson, assertUrl, constantTimeEqual } from './base.mjs'

function buildSignedUrl(rawUrl, secret) {
  if (!secret) return rawUrl
  const timestamp = Date.now().toString()
  const sign = createHmac('sha256', secret).update(`${timestamp}\n${secret}`).digest('base64')
  const url = new URL(rawUrl)
  url.searchParams.set('timestamp', timestamp)
  url.searchParams.set('sign', sign)
  return url.toString()
}

export default {
  id: 'dingtalk',
  inboundMode: 'webhook',

  async validateConnection(platform) {
    assertUrl(platform.values.webhookUrl?.trim(), '钉钉 Webhook URL')
  },

  async dispatch(platform, text) {
    const url = buildSignedUrl(platform.values.webhookUrl.trim(), platform.values.secret?.trim())
    await postJson(url, {
      msgtype: 'text',
      text: { content: text },
    })
  },

  verifyInbound(_rawBody, payload, _headers, platform) {
    const inboundToken = platform.values.inboundToken?.trim()
    const payloadToken = payload?.token || payload?.headers?.token || ''
    if (inboundToken && !constantTimeEqual(payloadToken, inboundToken)) {
      return { ok: false, error: '钉钉 token 校验失败' }
    }
    return { ok: true }
  },

  normalizeInbound(payload) {
    if (payload.challenge) {
      return { challenge: payload.challenge }
    }
    const text = payload.text?.content || payload.content?.text || payload.message?.text?.content || payload.text
    if (!String(text || '').trim()) return null
    const conversationId = String(payload.conversationId || payload.chatbotConversationId || payload.sessionWebhook || payload.senderStaffId || '')
    return {
      platformId: 'dingtalk',
      conversationId,
      chatId: conversationId,
      threadId: null,
      messageId: payload.msgId || payload.messageId || Date.now(),
      text: String(text).trim(),
      username: payload.senderNick || payload.senderStaffId || '',
    }
  },
}
