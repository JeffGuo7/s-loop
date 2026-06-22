import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

let _stateFile = ''
let _running = false
let _loopPromise = null

function _readState() {
  if (!existsSync(_stateFile)) {
    return { lastUpdateId: 0 }
  }
  try {
    return JSON.parse(readFileSync(_stateFile, 'utf-8'))
  } catch {
    return { lastUpdateId: 0 }
  }
}

function _writeState(state) {
  writeFileSync(_stateFile, JSON.stringify(state, null, 2), 'utf-8')
}

function _sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function _extractIncomingMessage(update) {
  const message = update.message || update.edited_message
  if (!message?.text?.trim()) return null

  const threadId = message.message_thread_id || null
  const chatId = String(message.chat?.id || '')
  const conversationId = threadId ? `${chatId}:${threadId}` : `${chatId}:main`

  return {
    updateId: update.update_id,
    conversationId,
    chatId,
    threadId,
    messageId: message.message_id,
    text: message.text.trim(),
    fromId: String(message.from?.id || ''),
    username: message.from?.username || '',
  }
}

async function _fetchUpdates(token, offset) {
  const url = new URL(`https://api.telegram.org/bot${token}/getUpdates`)
  url.searchParams.set('timeout', '20')
  url.searchParams.set('allowed_updates', JSON.stringify(['message', 'edited_message']))
  if (offset > 0) {
    url.searchParams.set('offset', String(offset))
  }

  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok || !data.ok) {
    throw new Error(data?.description || 'Telegram getUpdates 失败')
  }
  return data.result || []
}

export function initTelegramMonitor(baseDir) {
  const dir = join(baseDir, 'platforms')
  mkdirSync(dir, { recursive: true })
  _stateFile = join(dir, 'telegram-state.json')
  if (!existsSync(_stateFile)) {
    _writeState({ lastUpdateId: 0 })
  }
}

export async function startTelegramMonitor({ getToken, onMessage, onError }) {
  if (_running) return
  _running = true
  _loopPromise = (async () => {
    let backoffMs = 3000
    while (_running) {
      try {
        const token = await getToken()
        if (!token) {
          await _sleep(5000)
          continue
        }

        const current = _readState()
        const updates = await _fetchUpdates(token, (current.lastUpdateId || 0) + 1)
        if (updates.length === 0) {
          backoffMs = 3000
          continue
        }

        let nextUpdateId = current.lastUpdateId || 0
        for (const update of updates) {
          nextUpdateId = Math.max(nextUpdateId, update.update_id || 0)
          const incoming = _extractIncomingMessage(update)
          if (!incoming) continue
          await onMessage(incoming)
        }
        _writeState({ lastUpdateId: nextUpdateId })
        backoffMs = 3000
      } catch (err) {
        onError?.(err)
        await _sleep(backoffMs)
        backoffMs = Math.min(backoffMs * 2, 30000)
      }
    }
  })()

  await Promise.resolve()
}

export async function stopTelegramMonitor() {
  _running = false
  if (_loopPromise) {
    try {
      await _loopPromise
    } catch {
      // Ignore loop errors on shutdown.
    }
    _loopPromise = null
  }
}
