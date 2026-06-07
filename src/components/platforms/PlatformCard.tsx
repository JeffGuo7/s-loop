import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePlatformStore } from '../../stores'
import { Send, Check, Loader2, Link, Link2Off, ChevronDown } from 'lucide-react'
import { MagicButton } from '../ui'
import type { PlatformConfig } from '../../types/platform'

interface PlatformCardProps {
  platform: PlatformConfig
}

export function PlatformCard({ platform }: PlatformCardProps) {
  const { t } = useTranslation()
  const { updatePlatform, connect, disconnect, send, isConnecting } = usePlatformStore()
  const [expanded, setExpanded] = useState(false)
  const [testMsg, setTestMsg] = useState('')
  const connecting = isConnecting[platform.id] || false

  const allRequiredFilled = platform.fields
    .filter((f) => f.required)
    .every((f) => platform.values[f.key]?.trim())

  const handleFieldChange = (key: string, value: string) => {
    updatePlatform(platform.id, { [key]: value })
  }

  const handleConnect = () => {
    if (platform.connected) {
      disconnect(platform.id)
    } else {
      connect(platform.id)
    }
  }

  const handleSend = () => {
    if (!testMsg.trim()) return
    send(platform.id, testMsg.trim())
    setTestMsg('')
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
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-surface-secondary/50 border border-border-light outline-none text-[13px] font-medium transition-all"
                />
                <button
                  onClick={handleSend}
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
