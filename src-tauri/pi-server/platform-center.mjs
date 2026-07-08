import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getAdapter } from './platforms/registry.mjs'
import { prepareMessage } from './platforms/format.mjs'

const PLATFORM_PRESETS = [
  {
    id: 'telegram',
    name: 'Telegram',
    icon: 'Send',
    description: 'Telegram Bot 通知。需要 Bot Token 和 Chat ID。',
    enabled: false,
    connected: false,
    fields: [
      { key: 'botToken', label: 'Bot Token', type: 'password', placeholder: '123456:ABC-DEF1234...', required: true },
      { key: 'chatId', label: 'Chat ID', type: 'text', placeholder: '-1001234567890', required: true },
      { key: 'proxyUrl', label: '代理 URL（可选）', type: 'text', placeholder: 'http://127.0.0.1:7890', required: false },
    ],
    values: { botToken: '', chatId: '', proxyUrl: '', allowAll: 'false', allowedUsers: '', rateLimit: '10' },
  },
  {
    id: 'email',
    name: 'Email',
    icon: 'Mail',
    description: 'SMTP 邮件通知。支持 QQ邮箱、163、Gmail 等。',
    enabled: false,
    connected: false,
    fields: [
      { key: 'smtpHost', label: 'SMTP 服务器', type: 'text', placeholder: 'smtp.qq.com', required: true },
      { key: 'smtpPort', label: 'SMTP 端口', type: 'number', placeholder: '465', required: true },
      { key: 'username', label: '邮箱地址', type: 'text', placeholder: 'user@qq.com', required: true },
      { key: 'password', label: '密码/授权码', type: 'password', placeholder: '授权码', required: true },
      { key: 'to', label: '接收邮箱', type: 'text', placeholder: 'receiver@example.com', required: true },
    ],
    values: { smtpHost: '', smtpPort: '', username: '', password: '', to: '' },
  },
  {
    id: 'webhook',
    name: 'Webhook',
    icon: 'Webhook',
    description: '通用 Webhook。发送 JSON POST 请求到指定 URL。',
    enabled: false,
    connected: false,
    fields: [
      { key: 'url', label: 'Webhook URL', type: 'text', placeholder: 'https://hooks.example.com/...', required: true },
      { key: 'secret', label: '密钥（可选）', type: 'password', placeholder: '可选签名密钥', required: false },
    ],
    values: { url: '', secret: '' },
  },
  {
    id: 'feishu',
    name: '飞书',
    icon: 'MessageSquare',
    description: '飞书机器人通知。使用 Webhook URL 或 App 凭证。',
    enabled: false,
    connected: false,
    fields: [
      { key: 'webhookUrl', label: 'Webhook URL', type: 'text', placeholder: 'https://open.feishu.cn/open-apis/bot/v2/hook/...', required: true },
      { key: 'verificationToken', label: '事件 Token', type: 'password', placeholder: '用于校验飞书回调 token', required: false },
      { key: 'encryptKey', label: 'Encrypt Key', type: 'password', placeholder: '用于校验 x-lark-signature', required: false },
    ],
    values: { webhookUrl: '', verificationToken: '', encryptKey: '', allowAll: 'false', allowedUsers: '', rateLimit: '10' },
  },
  {
    id: 'dingtalk',
    name: '钉钉',
    icon: 'MessageSquare',
    description: '钉钉机器人通知。使用 Webhook URL 加签名。',
    enabled: false,
    connected: false,
    fields: [
      { key: 'webhookUrl', label: 'Webhook URL', type: 'text', placeholder: 'https://oapi.dingtalk.com/robot/send?access_token=...', required: true },
      { key: 'secret', label: '加签密钥', type: 'password', placeholder: 'SEC...', required: false },
      { key: 'inboundToken', label: '回调 Token', type: 'password', placeholder: '用于校验钉钉回调', required: false },
    ],
    values: { webhookUrl: '', secret: '', inboundToken: '', allowAll: 'false', allowedUsers: '', rateLimit: '10' },
  },
  {
    id: 'wechat',
    name: '企业微信',
    icon: 'MessageSquare',
    description: '企业微信群机器人通知。使用 Webhook URL。',
    enabled: false,
    connected: false,
    fields: [
      { key: 'webhookUrl', label: 'Webhook URL', type: 'text', placeholder: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...', required: true },
      { key: 'inboundToken', label: '回调 Token', type: 'password', placeholder: '用于校验企业微信回调', required: false },
    ],
    values: { webhookUrl: '', inboundToken: '', allowAll: 'false', allowedUsers: '', rateLimit: '10' },
  },
  {
    id: 'slack',
    name: 'Slack',
    icon: 'MessageSquare',
    description: 'Slack 工作区通知。使用 Incoming Webhook 或 Bot Token。',
    enabled: false,
    connected: false,
    fields: [
      { key: 'webhookUrl', label: 'Webhook URL', type: 'text', placeholder: 'https://hooks.slack.com/services/...', required: false },
      { key: 'botToken', label: 'Bot Token (xoxb-...)', type: 'password', placeholder: 'xoxb-...', required: false },
      { key: 'channelId', label: 'Channel ID', type: 'text', placeholder: 'C0123456789', required: false },
      { key: 'signingSecret', label: 'Signing Secret', type: 'password', placeholder: '用于校验 Slack 回调', required: false },
    ],
    values: { webhookUrl: '', botToken: '', channelId: '', signingSecret: '', allowAll: 'false', allowedUsers: '', rateLimit: '10' },
  },
  {
    id: 'discord',
    name: 'Discord',
    icon: 'MessageSquare',
    description: 'Discord 频道通知。使用 Webhook URL 或 Bot Token。',
    enabled: false,
    connected: false,
    fields: [
      { key: 'webhookUrl', label: 'Webhook URL', type: 'text', placeholder: 'https://discord.com/api/webhooks/...', required: false },
      { key: 'botToken', label: 'Bot Token', type: 'password', placeholder: 'Bot Token', required: false },
      { key: 'channelId', label: 'Channel ID', type: 'text', placeholder: 'Discord Channel ID', required: false },
      { key: 'publicKey', label: 'Public Key', type: 'password', placeholder: '用于校验 Discord 回调', required: false },
    ],
    values: { webhookUrl: '', botToken: '', channelId: '', publicKey: '', allowAll: 'false', allowedUsers: '', rateLimit: '10' },
  },
]

const MESSAGE_LIMIT = 100

let _platformDir = ''
let _platformFile = ''
let _messageFile = ''

function _initPaths(baseDir) {
  _platformDir = join(baseDir, 'platforms')
  _platformFile = join(_platformDir, 'platforms.json')
  _messageFile = join(_platformDir, 'messages.json')
  mkdirSync(_platformDir, { recursive: true })
}

function _readJson(file, fallback) {
  if (!existsSync(file)) return fallback
  try {
    return JSON.parse(readFileSync(file, 'utf-8'))
  } catch {
    return fallback
  }
}

function _writeJson(file, data) {
  writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8')
}

function _clonePlatform(platform) {
  return {
    ...platform,
    fields: platform.fields.map((field) => ({ ...field })),
    values: { ...platform.values },
  }
}

function _mergePlatforms(savedPlatforms = []) {
  return PLATFORM_PRESETS.map((preset) => {
    const saved = savedPlatforms.find((item) => item.id === preset.id)
    return {
      ..._clonePlatform(preset),
      enabled: saved?.enabled ?? preset.enabled,
      connected: saved?.connected ?? preset.connected,
      values: { ...preset.values, ...(saved?.values || {}) },
    }
  })
}

function _loadPlatforms() {
  const saved = _readJson(_platformFile, { platforms: [] })
  return _mergePlatforms(saved.platforms)
}

function _savePlatforms(platforms) {
  _writeJson(_platformFile, { updatedAt: new Date().toISOString(), platforms })
}

function _loadMessages() {
  return _readJson(_messageFile, { messages: [] }).messages || []
}

function _saveMessages(messages) {
  _writeJson(_messageFile, { updatedAt: new Date().toISOString(), messages: messages.slice(-MESSAGE_LIMIT) })
}

function _snapshot() {
  return {
    platforms: _loadPlatforms(),
    messages: _loadMessages().slice().reverse(),
  }
}

function _findPlatform(platforms, platformId) {
  const platform = platforms.find((item) => item.id === platformId)
  if (!platform) {
    throw new Error(`Unknown platform: ${platformId}`)
  }
  return platform
}

function _assertRequired(platform) {
  for (const field of platform.fields) {
    if (field.required && !String(platform.values[field.key] || '').trim()) {
      throw new Error(`${platform.name} 缺少必填字段：${field.label}`)
    }
  }
}

function _appendMessage(platformId, direction, text) {
  const messages = _loadMessages()
  messages.push({
    id: randomUUID(),
    platformId,
    direction,
    text,
    timestamp: Date.now(),
  })
  _saveMessages(messages)
}

async function _validateConnection(platform) {
  _assertRequired(platform)
  await getAdapter(platform.id).validateConnection(platform)
}

async function _dispatchMessage(platform, text, options = {}) {
  if (!text?.trim()) {
    throw new Error('消息内容不能为空')
  }
  const adapter = getAdapter(platform.id)
  // Format (markdown → platform-appropriate) and split under the size cap.
  const chunks = prepareMessage(adapter, text)
  for (const chunk of chunks) {
    if (!chunk.trim()) continue
    await adapter.dispatch(platform, chunk, options)
  }
}

export function initPlatformCenter(baseDir) {
  _initPaths(baseDir)
  if (!existsSync(_platformFile)) {
    _savePlatforms(_mergePlatforms())
  }
  if (!existsSync(_messageFile)) {
    _saveMessages([])
  }
}

export function getPlatformSnapshot() {
  return _snapshot()
}

export function getPlatformConfig(platformId) {
  const platforms = _loadPlatforms()
  return _findPlatform(platforms, platformId)
}

export function updatePlatformConfig(platformId, values = {}) {
  const platforms = _loadPlatforms()
  const platform = _findPlatform(platforms, platformId)
  platform.values = { ...platform.values, ...values }
  _savePlatforms(platforms)
  return _snapshot()
}

export async function connectPlatform(platformId, values = {}) {
  const platforms = _loadPlatforms()
  const platform = _findPlatform(platforms, platformId)
  platform.values = { ...platform.values, ...values }
  await _validateConnection(platform)
  platform.connected = true
  platform.enabled = true
  _savePlatforms(platforms)
  return _snapshot()
}

export function disconnectPlatform(platformId) {
  const platforms = _loadPlatforms()
  const platform = _findPlatform(platforms, platformId)
  platform.connected = false
  _savePlatforms(platforms)
  return _snapshot()
}

export function recordPlatformMessage(platformId, direction, text) {
  _appendMessage(platformId, direction, text)
  return _snapshot()
}

export async function sendPlatformMessage(platformId, text, options = {}) {
  const platforms = _loadPlatforms()
  const platform = _findPlatform(platforms, platformId)
  _assertRequired(platform)
  await _dispatchMessage(platform, text, options)
  _appendMessage(platformId, 'sent', text)
  return _snapshot()
}

export async function testPlatform(platformId, text) {
  const content = text?.trim() || `Test message from S-Loop at ${new Date().toLocaleString()}`
  return sendPlatformMessage(platformId, content)
}

export function clearPlatformMessages() {
  _saveMessages([])
  return _snapshot()
}
