import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MAX_MESSAGES = 500

let _syncFile = ''

function _readSync() {
  if (!existsSync(_syncFile)) {
    return {
      updatedAt: 0,
      conversations: [],
      messages: [],
    }
  }
  try {
    return JSON.parse(readFileSync(_syncFile, 'utf-8'))
  } catch {
    return {
      updatedAt: 0,
      conversations: [],
      messages: [],
    }
  }
}

function _writeSync(data) {
  writeFileSync(_syncFile, JSON.stringify(data, null, 2), 'utf-8')
}

function _conversationTitle(meta) {
  const label = {
    telegram: 'Telegram',
    feishu: '飞书',
    dingtalk: '钉钉',
    wechat: '企业微信',
  }[meta.platformId] || meta.platformId
  if (meta.title) return meta.title
  if (meta.username) return `${label} @${meta.username}`
  return `${label} ${meta.chatId || meta.conversationId}`
}

function _upsertConversation(data, meta) {
  const now = Date.now()
  const sessionId = `${meta.platformId}:${meta.conversationId}`
  const title = _conversationTitle(meta)
  const existing = data.conversations.find((item) => item.id === `${meta.platformId}:${meta.conversationId}`)

  if (existing) {
    existing.title = title
    existing.updatedAt = now
    existing.lastMessageAt = now
    existing.chatId = meta.chatId
    existing.threadId = meta.threadId || null
    existing.username = meta.username || ''
    return existing
  }

  const conversation = {
    id: `${meta.platformId}:${meta.conversationId}`,
    sessionId,
    title,
    platformId: meta.platformId,
    chatId: meta.chatId,
    threadId: meta.threadId || null,
    username: meta.username || '',
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
  }
  data.conversations.push(conversation)
  return conversation
}

function _appendMessage(data, message) {
  const exists = data.messages.find((item) => item.id === message.id)
  if (exists) {
    Object.assign(exists, message)
  } else {
    data.messages.push(message)
  }
  if (data.messages.length > MAX_MESSAGES) {
    data.messages = data.messages.slice(-MAX_MESSAGES)
  }
  data.updatedAt = Date.now()
}

export function initTelegramChatSync(baseDir) {
  const dir = join(baseDir, 'platforms')
  mkdirSync(dir, { recursive: true })
  _syncFile = join(dir, 'telegram-chat-sync.json')
  if (!existsSync(_syncFile)) {
    _writeSync({
      updatedAt: 0,
      conversations: [],
      messages: [],
    })
  }
}

export function recordPlatformInbound(meta) {
  const data = _readSync()
  const conversation = _upsertConversation(data, meta)
  _appendMessage(data, {
    id: `${meta.platformId}-in:${meta.conversationId}:${meta.messageId}`,
    sessionId: conversation.sessionId,
    conversationId: meta.conversationId,
    role: 'user',
    text: meta.text,
    createdAt: Date.now(),
    platformId: meta.platformId,
  })
  _writeSync(data)
  return data
}

export function recordPlatformOutbound(meta) {
  const data = _readSync()
  const conversation = _upsertConversation(data, meta)
  _appendMessage(data, {
    id: `${meta.platformId}-out:${meta.conversationId}:${meta.replyKey}`,
    sessionId: conversation.sessionId,
    conversationId: meta.conversationId,
    role: 'assistant',
    text: meta.text,
    createdAt: Date.now(),
    platformId: meta.platformId,
  })
  _writeSync(data)
  return data
}

export function getPlatformChatSyncSnapshot() {
  return _readSync()
}
