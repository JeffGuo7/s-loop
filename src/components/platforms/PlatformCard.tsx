import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { usePlatformStore } from '../../stores'
import { Send, Check, Loader2, Link, Link2Off, ChevronDown } from 'lucide-react'
import { MagicButton } from '../ui'
import type { PlatformConfig } from '../../types/platform'
import { getBaseUrl } from '../../utils/piClient'
import { jsonRequest } from '../../utils/http'

interface ContactEntry {
  key: string
  username: string
  fromId: string
  chatId: string
  lastSeen: number
}

interface PlatformCardProps {
  platform: PlatformConfig
}

export function PlatformCard({ platform }: PlatformCardProps) {
  const { t } = useTranslation()
  const { updatePlatform, connect, disconnect, send, isConnecting } = usePlatformStore()
  const [expanded, setExpanded] = useState(false)
  const [testMsg, setTestMsg] = useState('')
  const connecting = isConnecting[platform.id] || false
  const isInbound = ['telegram', 'feishu', 'dingtalk', 'wechat', 'slack', 'discord', 'qqbot'].includes(platform.id)
  const allowAll = platform.values.allowAll === 'true'
  const [contacts, setContacts] = useState<ContactEntry[]>([])

  // Load known contacts when card is expanded
  useEffect(() => {
    if (!expanded || !isInbound) return
    fetch(`${getBaseUrl()}/platforms/contacts`)
      .then((r) => r.json())
      .then((data) => setContacts(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [expanded, isInbound])

  const inboundUrl = ['feishu', 'dingtalk', 'wechat', 'slack', 'discord'].includes(platform.id)
    ? `${getBaseUrl()}/platforms/inbound/${platform.id}`
    : ''
  const inboundGuide = {
    feishu: '飞书建议同时填写事件 Token 与 Encrypt Key。事件订阅回调先做 token/签名校验，再快速 ACK，模式参考 openclaw 的企业平台 webhook 处理。',
    dingtalk: '钉钉建议填写回调 Token；出站仍可复用现有加签密钥。若平台回调会重复投递，S-Loop 会按 messageId 做轻量去重。',
    wechat: '企业微信建议填写回调 Token。当前先做最小 token 校验和快速 ACK，后续可继续补更完整的签名与时间窗校验。',
  }[platform.id as 'feishu' | 'dingtalk' | 'wechat']

  const allRequiredFilled = platform.fields
    .filter((f) => f.required)
    .every((f) => platform.values[f.key]?.trim())

  const handleFieldChange = (key: string, value: string) => {
    updatePlatform(platform.id, { [key]: value })
  }

  const handleConnect = () => {
    if (platform.connected) {
      void disconnect(platform.id)
    } else {
      void connect(platform.id)
    }
  }

  const handleSend = async () => {
    if (!testMsg.trim()) return
    try {
      await send(platform.id, testMsg.trim())
      setTestMsg('')
    } catch {
      // Error state is surfaced by the store.
    }
  }

  return (
    <div
      className={`rounded-2xl border-2 transition-all ${
        expanded
          ? 'border-accent/25 bg-surface shadow-md'
          : 'border-border-light bg-surface/50 hover:border-accent/15'
      }`}
    >
      {/* Card Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-4 px-6 py-5 text-left"
      >
        <div
          className={`p-3 rounded-xl transition-all ${
            platform.connected
              ? 'bg-green-500/10 text-green-500'
              : 'bg-surface-secondary text-text-tertiary'
          }`}
        >
          <Send size={20} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h4 className="font-bold text-text text-[15px]">{platform.name}</h4>
            {platform.connected && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-green-500 bg-green-500/10 px-2.5 py-0.5 rounded-full">
                {t('platforms.status.connected')}
              </span>
            )}
          </div>
          <p className="text-[12px] text-text-tertiary mt-0.5 leading-relaxed">{platform.description}</p>
        </div>

        <ChevronDown
          size={18}
          className={`text-text-quaternary transition-transform duration-300 ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Expanded Config */}
      {expanded && (
        <div className="px-6 pb-6 border-t border-border-light/50 pt-5 space-y-5 animate-fade-in">
          {/* Config Fields */}
          <div className="grid grid-cols-1 gap-4">
            {platform.fields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-tertiary ml-1">
                  {field.label}
                  {field.required && <span className="text-red-400 ml-1">*</span>}
                </label>
                {field.key === 'chatId' && platform.id === 'telegram' && (
                  <DetectChatIdButton platform={platform} onDetected={(chatId) => handleFieldChange('chatId', chatId)} />
                )}
                <input
                  type={field.type}
                  value={platform.values[field.key] || ''}
                  onChange={(e) => handleFieldChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  disabled={platform.connected || connecting}
                  className="w-full px-4 py-3 rounded-xl bg-surface-secondary/50 border border-border-light focus:bg-surface focus:border-accent/40 outline-none text-[14px] font-mono font-bold tracking-tight transition-all"
                />
              </div>
            ))}
          </div>

          {/* Access Control — inbound platforms only */}
          {isInbound && (
            <div className="rounded-xl border border-border-light bg-surface-secondary/40 px-4 py-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-text-secondary">
                    {t('platforms.access.title')}
                  </p>
                  <p className="text-[11px] text-text-quaternary mt-0.5">
                    {t('platforms.access.desc')}
                  </p>
                </div>
              </div>

              {/* Allow all toggle */}
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-[12px] font-medium text-text-secondary">
                  {t('platforms.access.allowAll')}
                </span>
                <button
                  onClick={() => handleFieldChange('allowAll', allowAll ? 'false' : 'true')}
                  className={`relative w-10 h-5.5 rounded-full transition-colors ${allowAll ? 'bg-accent' : 'bg-surface-tertiary'}`}
                  style={{ width: 40, height: 22 }}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${allowAll ? 'translate-x-[18px]' : ''}`}
                  />
                </button>
              </label>

              {/* Whitelist — visual contact list */}
              {!allowAll && (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-tertiary">
                    {t('platforms.access.whitelist')}
                  </label>
                  {contacts.length === 0 ? (
                    <p className="text-[11px] text-text-quaternary">暂无已知联系人。有人给 bot 发消息后会出现在这里。</p>
                  ) : (
                    <div className="space-y-1">
                      {contacts.map((c) => {
                        const allowed = platform.values.allowedUsers || ''
                        const isAllowed = allowed.split(/[\n,]/).map(s => s.trim()).includes(c.fromId) ||
                                         allowed.split(/[\n,]/).map(s => s.trim()).includes(c.chatId) ||
                                         allowed.split(/[\n,]/).map(s => s.trim()).includes(c.username)
                        return (
                          <label key={c.key} className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface border border-border-light/60 hover:border-accent/20 transition-colors cursor-pointer">
                            <div className="min-w-0">
                              <span className="text-[12px] font-medium text-text truncate block">
                                {c.username ? `@${c.username}` : c.key}
                              </span>
                              <span className="text-[10px] text-text-quaternary font-mono">{c.fromId || c.chatId}</span>
                            </div>
                            <button
                              onClick={() => {
                                const current = platform.values.allowedUsers || ''
                                const entries = current.split(/[\n,]/).map(s => s.trim()).filter(Boolean)
                                const id = c.fromId || c.chatId || c.username
                                const newEntries = isAllowed
                                  ? entries.filter(e => e !== c.fromId && e !== c.chatId && e !== c.username)
                                  : [...entries, id]
                                handleFieldChange('allowedUsers', newEntries.join('\n'))
                              }}
                              className={`shrink-0 relative w-9 h-5 rounded-full transition-colors ${isAllowed ? 'bg-accent' : 'bg-surface-tertiary'}`}
                              style={{ width: 36, height: 22 }}
                            >
                              <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isAllowed ? 'translate-x-[14px]' : ''}`} />
                            </button>
                          </label>
                        )
                      })}
                    </div>
                  )}
                  <p className="text-[10px] text-text-quaternary">{t('platforms.access.whitelistHint')}</p>
                </div>
              )}

              {/* Rate limit */}
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-text-secondary">
                  {t('platforms.access.rateLimit')}
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={platform.values.rateLimit || '10'}
                    onChange={(e) => handleFieldChange('rateLimit', e.target.value)}
                    className="w-16 px-2.5 py-1.5 rounded-lg bg-surface border border-border-light focus:border-accent/40 outline-none text-[13px] font-semibold text-center"
                  />
                  <span className="text-[11px] text-text-quaternary">{t('platforms.access.perMinute')}</span>
                </div>
              </div>
            </div>
          )}

          {inboundUrl && (
            <div className="rounded-xl border border-border-light bg-surface-secondary/40 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-tertiary mb-2">
                Inbound Webhook
              </p>
              <p className="text-[12px] font-mono font-bold break-all text-text-secondary">
                {inboundUrl}
              </p>
              <p className="mt-2 text-[11px] text-text-quaternary leading-relaxed">
                企业平台入站已走 webhook 监听。若要让飞书、钉钉、企业微信从云端回调到本机，请为该地址配置公网映射或内网穿透。
              </p>
              {inboundGuide && (
                <p className="mt-2 text-[11px] text-text-quaternary leading-relaxed">
                  {inboundGuide}
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <MagicButton
              onClick={handleConnect}
              isDisabled={connecting || (!platform.connected && !allRequiredFilled)}
              className={`h-10 px-6 rounded-xl text-[12px] ${
                platform.connected
                  ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                  : ''
              }`}
            >
              {connecting ? (
                <Loader2 size={16} className="animate-spin" />
              ) : platform.connected ? (
                <Link2Off size={16} />
              ) : (
                <Link size={16} />
              )}
              <span>
                {connecting
                  ? t('platforms.status.connecting')
                  : platform.connected
                  ? t('platforms.status.disconnect')
                  : t('platforms.status.connect')}
              </span>
            </MagicButton>

            {platform.connected && (
              <div className="flex items-center gap-2 flex-1 ml-2">
                <input
                  type="text"
                  value={testMsg}
                  onChange={(e) => setTestMsg(e.target.value)}
                  placeholder={t('platforms.testPlaceholder')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      void handleSend()
                    }
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-surface-secondary/50 border border-border-light outline-none text-[13px] font-medium transition-all"
                />
                <button
                  onClick={() => void handleSend()}
                  disabled={!testMsg.trim()}
                  className="p-2.5 rounded-xl bg-accent text-accent-foreground hover:opacity-90 transition-all disabled:opacity-30"
                >
                  <Send size={16} />
                </button>
              </div>
            )}
          </div>

          {platform.connected && (
            <p className="text-[11px] text-text-quaternary flex items-center gap-2 ml-1">
              <Check size={12} className="text-green-500" />
              {t('platforms.status.ready')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function DetectChatIdButton({ platform, onDetected }: { platform: PlatformConfig; onDetected: (chatId: string) => void }) {
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  const handleDetect = async () => {
    setLoading(true)
    setMsg('')
    try {
      const token = platform.values.botToken?.trim()
      if (!token) { setMsg('请先填写 Bot Token'); setLoading(false); return }

      // Call Telegram getUpdates directly to find recent messages
      const url = `https://api.telegram.org/bot${token}/getUpdates?limit=5&allowed_updates=["message"]`
      const res = await fetch(url)
      const data = await res.json()
      if (!data.ok) { setMsg(data.description || 'Bot Token 无效'); setLoading(false); return }

      for (const update of (data.result || [])) {
        const msg = update.message
        if (!msg?.chat?.id) continue
        const chatId = String(msg.chat.id)
        const username = msg.from?.username || msg.from?.first_name || ''

        // Reply to the user with their chat ID
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, jsonRequest({
          chat_id: chatId,
          text: `Your Chat ID: \`${chatId}\`\nUsername: @${username}\n\nCopy this Chat ID into S-Loop platform settings.`,
          parse_mode: 'Markdown',
        }))

        onDetected(chatId)
        setMsg(`Found: ${chatId} (@${username}). Sent confirmation to Telegram.`)
        setLoading(false)
        return
      }
      setMsg('No messages found. Send any message to your bot on Telegram first, then click Detect again.')
    } catch {
      setMsg('Network error. Check proxy or bot token.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="-mt-1 mb-2 flex items-center gap-2">
      <button
        onClick={handleDetect}
        disabled={loading}
        className="rounded-lg bg-accent/10 px-3 py-1.5 text-[10px] font-bold text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
      >
        {loading ? 'Detecting...' : 'Detect Chat ID'}
      </button>
      {msg && <span className="text-[10px] text-text-tertiary">{msg}</span>}
    </div>
  )
}
