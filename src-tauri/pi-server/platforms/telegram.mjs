/**
 * Telegram adapter. Inbound via long-polling (see telegram-monitor.mjs),
 * so verifyInbound/normalizeInbound aren't used by the webhook route.
 *
 * All requests route through an optional proxy (platform.values.proxyUrl)
 * since api.telegram.org is unreachable without one in some regions.
 *
 * Chat ID discovery: Send any message to your bot, then call getFirstChatId()
 * to retrieve it. Or use @userinfobot on Telegram.
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

  /**
   * Fetch the most recent chat_id from incoming messages.
   * Returns { chatId, username } or null. Use this to discover your
   * Chat ID: send any message to the bot, then call this function.
   */
  async getFirstChatId(platform) {
    const token = platform.values.botToken.trim()
    const dispatcher = getProxyDispatcher(platform.values.proxyUrl)
    const url = new URL(`https://api.telegram.org/bot${token}/getUpdates`)
    url.searchParams.set('limit', '5')
    url.searchParams.set('allowed_updates', JSON.stringify(['message']))
    const res = await fetch(url, dispatcher ? { dispatcher } : {})
    const data = await res.json()
    if (!data.ok) throw new Error(data?.description || 'getUpdates 失败')
    for (const update of data.result || []) {
      const msg = update.message
      if (!msg?.chat?.id) continue
      // Reply with chat_id so the user sees it
      const chatId = String(msg.chat.id)
      const username = msg.from?.username || msg.from?.first_name || ''
      await postJson(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          chat_id: chatId,
          text: `Your Chat ID: \`${chatId}\`\nUsername: @${username}\n\nCopy this Chat ID into S-Loop's platform settings.`,
          parse_mode: 'Markdown',
        },
        {},
        dispatcher,
      )
      return { chatId, username }
    }
    return null
  },
}
