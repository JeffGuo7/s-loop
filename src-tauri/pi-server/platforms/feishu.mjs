/**
 * Feishu (飞书) adapter. Inbound via webhook with optional token +
 * x-lark-signature verification. Outbound via bot webhook URL.
 */
import { createHash } from 'node:crypto'
import { postJson, assertUrl, constantTimeEqual } from './base.mjs'

export default {
  id: 'feishu',
  inboundMode: 'webhook',

  async validateConnection(platform) {
    assertUrl(platform.values.webhookUrl?.trim(), '飞书 Webhook URL')
  },

  async dispatch(platform, text) {
    await postJson(platform.values.webhookUrl.trim(), {
      msg_type: 'text',
      content: { text },
    })
  },

  verifyInbound(rawBody, payload, headers, platform) {
    const verificationToken = platform.values.verificationToken?.trim()
    const encryptKey = platform.values.encryptKey?.trim()
    const payloadToken = payload?.header?.token || payload?.token || ''
    if (verificationToken && !constantTimeEqual(payloadToken, verificationToken)) {
      return { ok: false, error: '飞书 token 校验失败' }
    }
    const signature = headers['x-lark-signature']
    const timestamp = headers['x-lark-request-timestamp']
    const nonce = headers['x-lark-request-nonce']
    if (encryptKey && signature && timestamp && nonce) {
      const expected = createHash('sha256')
        .update(`${timestamp}${nonce}${encryptKey}${rawBody}`, 'utf8')
        .digest('hex')
      if (!constantTimeEqual(signature, expected)) {
        return { ok: false, error: '飞书签名校验失败' }
      }
    }
    return { ok: true }
  },

  normalizeInbound(payload) {
    if (payload.challenge) {
      return { challenge: payload.challenge }
    }
    const event = payload.event || {}
    const message = event.message || {}
    const sender = event.sender || {}
    let text = ''
    if (typeof message.content === 'string') {
      try {
        const parsed = JSON.parse(message.content)
        text = parsed?.text || parsed?.content || ''
      } catch {
        text = message.content
      }
    }
    if (!text?.trim()) return null
    const chatId = String(message.chat_id || event.open_chat_id || event.chat_id || '')
    return {
      platformId: 'feishu',
      conversationId: String(message.chat_id || event.open_chat_id || event.chat_id || sender.sender_id?.open_id || sender.sender_id?.union_id || ''),
      chatId,
      threadId: message.thread_id || null,
      messageId: message.message_id || payload.header?.event_id || Date.now(),
      text: text.trim(),
      username: sender.sender_id?.open_id || sender.sender_id?.union_id || '',
    }
  },
}
