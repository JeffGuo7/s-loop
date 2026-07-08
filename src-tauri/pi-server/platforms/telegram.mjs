/**
 * Telegram adapter. Inbound via long-polling (see telegram-monitor.mjs),
 * so verifyInbound/normalizeInbound aren't used by the webhook route.
 */
import { postJson } from './base.mjs'

export default {
  id: 'telegram',
  inboundMode: 'polling',

  async validateConnection(platform) {
    const token = platform.values.botToken.trim()
    const result = await fetch(`https://api.telegram.org/bot${token}/getMe`)
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
    await postJson(`https://api.telegram.org/bot${token}/sendMessage`, payload)
  },
}
