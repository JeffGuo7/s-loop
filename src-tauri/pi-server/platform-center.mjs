import { createHmac, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import nodemailer from 'nodemailer'

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
    ],
    values: { botToken: '', chatId: '' },
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
    values: { webhookUrl: '', verificationToken: '', encryptKey: '' },
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
    values: { webhookUrl: '', secret: '', inboundToken: '' },
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
    values: { webhookUrl: '', inboundToken: '' },
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

function _assertUrl(value, label) {
  try {
    return new URL(value)
  } catch {
    throw new Error(`${label} 格式无效`)
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

async function _postJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    throw new Error(
      typeof data === 'string'
        ? data
        : data?.description || data?.errmsg || data?.msg || `HTTP ${res.status}`,
    )
  }
  return data
}

async function _connectTelegram(platform) {
  const token = platform.values.botToken.trim()
  const result = await fetch(`https://api.telegram.org/bot${token}/getMe`)
  const data = await result.json()
  if (!result.ok || !data.ok) {
    throw new Error(data?.description || 'Telegram Bot Token 校验失败')
  }
}

async function _sendTelegram(platform, text, options = {}) {
  const token = platform.values.botToken.trim()
  const chatId = String(options.chatId || platform.values.chatId || '').trim()
  const payload = {
    chat_id: chatId,
    text,
  }
  if (options.threadId) {
    payload.message_thread_id = options.threadId
  }
  if (options.replyToMessageId) {
    payload.reply_to_message_id = options.replyToMessageId
  }
  await _postJson(`https://api.telegram.org/bot${token}/sendMessage`, payload)
}

async function _connectEmail(platform) {
  const transporter = nodemailer.createTransport({
    host: platform.values.smtpHost.trim(),
    port: Number(platform.values.smtpPort || 465),
    secure: Number(platform.values.smtpPort || 465) === 465,
    auth: {
      user: platform.values.username.trim(),
      pass: platform.values.password,
    },
  })
  await transporter.verify()
}

async function _sendEmail(platform, text) {
  const transporter = nodemailer.createTransport({
    host: platform.values.smtpHost.trim(),
    port: Number(platform.values.smtpPort || 465),
    secure: Number(platform.values.smtpPort || 465) === 465,
    auth: {
      user: platform.values.username.trim(),
      pass: platform.values.password,
    },
  })
  await transporter.sendMail({
    from: platform.values.username.trim(),
    to: platform.values.to.trim(),
    subject: 'S-Loop Notification',
    text,
  })
}

function _buildDingTalkSignedUrl(rawUrl, secret) {
  if (!secret) return rawUrl
  const timestamp = Date.now().toString()
  const sign = createHmac('sha256', secret).update(`${timestamp}\n${secret}`).digest('base64')
  const url = new URL(rawUrl)
  url.searchParams.set('timestamp', timestamp)
  url.searchParams.set('sign', sign)
  return url.toString()
}

async function _sendWebhook(platform, text) {
  const body = {
    text,
    source: 's-loop',
    platformId: platform.id,
    timestamp: new Date().toISOString(),
  }
  const headers = {}
  const secret = platform.values.secret?.trim()
  if (secret) {
    headers['X-S-Loop-Signature'] = createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex')
  }
  await _postJson(platform.values.url.trim(), body, headers)
}

async function _sendFeishu(platform, text) {
  await _postJson(platform.values.webhookUrl.trim(), {
    msg_type: 'text',
    content: { text },
  })
}

async function _sendDingTalk(platform, text) {
  const url = _buildDingTalkSignedUrl(platform.values.webhookUrl.trim(), platform.values.secret?.trim())
  await _postJson(url, {
    msgtype: 'text',
    text: { content: text },
  })
}

async function _sendWechat(platform, text) {
  await _postJson(platform.values.webhookUrl.trim(), {
    msgtype: 'text',
    text: { content: text },
  })
}

function _validateWebhookLike(platform, key, label) {
  _assertUrl(platform.values[key]?.trim(), label)
}

async function _validateConnection(platform) {
  _assertRequired(platform)
  switch (platform.id) {
    case 'telegram':
      await _connectTelegram(platform)
      return
    case 'email':
      await _connectEmail(platform)
      return
    case 'webhook':
      _validateWebhookLike(platform, 'url', 'Webhook URL')
      return
    case 'feishu':
    case 'dingtalk':
    case 'wechat':
      _validateWebhookLike(platform, 'webhookUrl', `${platform.name} Webhook URL`)
      return
    default:
      throw new Error(`Unsupported platform: ${platform.id}`)
  }
}

async function _dispatchMessage(platform, text, options = {}) {
  if (!text?.trim()) {
    throw new Error('消息内容不能为空')
  }
  switch (platform.id) {
    case 'telegram':
      await _sendTelegram(platform, text, options)
      return
    case 'email':
      await _sendEmail(platform, text)
      return
    case 'webhook':
      await _sendWebhook(platform, text)
      return
    case 'feishu':
      await _sendFeishu(platform, text)
      return
    case 'dingtalk':
      await _sendDingTalk(platform, text)
      return
    case 'wechat':
      await _sendWechat(platform, text)
      return
    default:
      throw new Error(`Unsupported platform: ${platform.id}`)
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
