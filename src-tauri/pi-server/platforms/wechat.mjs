/**
 * WeChat Work (企业微信) adapter. Inbound via webhook with optional token
 * verification. Outbound via group bot webhook URL.
 */
import { postJson, assertUrl, constantTimeEqual } from './base.mjs'

export default {
  id: 'wechat',
  inboundMode: 'webhook',

  async validateConnection(platform) {
    assertUrl(platform.values.webhookUrl?.trim(), '企业微信 Webhook URL')
  },

  async dispatch(platform, text) {
    await postJson(platform.values.webhookUrl.trim(), {
      msgtype: 'text',
      text: { content: text },
    })
  },

  verifyInbound(_rawBody, payload, _headers, platform) {
    const inboundToken = platform.values.inboundToken?.trim()
    const payloadToken = payload?.token || payload?.headers?.token || ''
    if (inboundToken && !constantTimeEqual(payloadToken, inboundToken)) {
      return { ok: false, error: '企业微信 token 校验失败' }
    }
    return { ok: true }
  },

  normalizeInbound(payload) {
    const text = payload.text?.content || payload.content || payload.message?.content || payload.msg || ''
    if (!String(text || '').trim()) return null
    const conversationId = String(payload.chatid || payload.roomid || payload.from?.id || payload.sender || '')
    return {
      platformId: 'wechat',
      conversationId,
      chatId: conversationId,
      threadId: null,
      messageId: payload.msgid || payload.messageId || Date.now(),
      text: String(text).trim(),
      username: payload.from?.name || payload.sender || '',
    }
  },
}
