export type PlatformId = 'telegram' | 'email' | 'webhook' | 'feishu' | 'dingtalk' | 'wechat' | 'slack' | 'discord'

export interface PlatformField {
  key: string
  label: string
  type: 'text' | 'password' | 'number'
  placeholder: string
  required: boolean
}

export interface PlatformConfig {
  id: PlatformId
  name: string
  icon: string
  description: string
  enabled: boolean
  connected: boolean
  fields: PlatformField[]
  values: Record<string, string>
}

export interface PlatformMessage {
  id: string
  platformId: PlatformId
  direction: 'sent' | 'received'
  text: string
  timestamp: number
}

export interface PlatformSnapshot {
  platforms: PlatformConfig[]
  messages: PlatformMessage[]
}

export const PLATFORM_PRESETS: PlatformConfig[] = [
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
    values: { webhookUrl: '', botToken: '', channelId: '', signingSecret: '' },
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
    values: { webhookUrl: '', botToken: '', channelId: '', publicKey: '' },
  },
]
