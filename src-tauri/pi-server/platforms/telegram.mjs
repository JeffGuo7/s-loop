/**
 * Telegram adapter. Inbound via long-polling (see telegram-monitor.mjs),
 * so verifyInbound/normalizeInbound aren't used by the webhook route.
 *
 * All requests route through an optional proxy (platform.values.proxyUrl)
 * since api.telegram.org is unreachable without one in some regions.
 */
import { postJson, getProxyDispatcher } from './base.mjs'

export default {
  id: 'telegram',
  inboundMode: 'polling',
  maxLength: 4096,

  async validateConnection(platform) {
    const token = platform.values.botToken.trim()
    const dispatcher = getProxyDispatcher(platform.values.proxyUrl)
    const result = await fetch(`https://api.telegram.org/bot${token}/getMe`, dispatcher ? { dispatcher } : {})
    const data = await result.json()
    if (!result.ok || !data.ok) {
      throw new Error(data?.description || 'Telegram Bot Token 校验失败')
    }
  },

  async dispatch(platform, text, options = {}) {
    const token = platform.values.botToken.trim()
    const chatId = String(options.chatId || platform.values.chatId || '').trim()
    const payload = { chat_id: chatId, text }
    if (options.threadId) payload.message_thread_id = options.threadId
    if (options.replyToMessageId) payload.reply_to_message_id = options.replyToMessageId
    await postJson(
      `https://api.telegram.org/bot${token}/sendMessage`,
      payload,
      {},
      getProxyDispatcher(platform.values.proxyUrl),
    )
  },

  // Best-effort "typing…" indicator while the AI generates a reply.
  async sendTyping(platform, options = {}) {
    const token = platform.values.botToken.trim()
    const chatId = String(options.chatId || platform.values.chatId || '').trim()
    if (!chatId) return
    const payload = { chat_id: chatId, action: 'typing' }
    if (options.threadId) payload.message_thread_id = options.threadId
    await postJson(
      `https://api.telegram.org/bot${token}/sendChatAction`,
      payload,
      {},
      getProxyDispatcher(platform.values.proxyUrl),
    )
  },
}
