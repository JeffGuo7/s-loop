import { useTranslation } from 'react-i18next'
import { usePlatformStore } from '../../stores'
import { Bot, MessageSquare, Send } from 'lucide-react'
import type { PlatformMessage } from '../../types/platform'

interface PlatformMessageLogProps {
  messages: PlatformMessage[]
}

const PLATFORM_COLORS: Record<string, string> = {
  telegram: 'text-blue-500',
  email: 'text-purple-500',
  webhook: 'text-orange-500',
  feishu: 'text-cyan-500',
  dingtalk: 'text-yellow-500',
  wechat: 'text-green-500',
}

export function PlatformMessageLog({ messages }: PlatformMessageLogProps) {
  const { t } = useTranslation()
  const { clearMessages } = usePlatformStore()

  if (messages.length === 0) {
    return (
      <div className="py-24 flex flex-col items-center justify-center opacity-30 text-center animate-fade-in">
        <div className="p-8 rounded-[40px] bg-surface-secondary/50 mb-6">
          <MessageSquare size={48} className="text-text-tertiary" />
        </div>
        <p className="text-lg font-bold text-text tracking-tight">{t('platforms.log.empty')}</p>
        <p className="text-[12px] mt-1 font-bold">{t('platforms.log.noMessages')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-text-tertiary opacity-50">
          {t('platforms.log.title')} ({messages.length})
        </span>
        <button
          onClick={() => { void clearMessages() }}
          className="text-[11px] font-bold text-red-400 hover:text-red-500 uppercase tracking-wider px-4 py-1.5 rounded-xl hover:bg-red-500/5 transition-all"
        >
          {t('platforms.log.clear')}
        </button>
      </div>

      <div className="space-y-3">
        {[...messages].reverse().map((msg) => (
          <div
            key={msg.id}
            className="flex items-start gap-4 p-5 rounded-2xl bg-surface/50 border border-border-light/50 hover:border-accent/15 transition-all"
          >
            <div
              className={`p-2.5 rounded-xl shrink-0 ${
                msg.direction === 'sent' ? 'bg-accent/10 text-accent' : 'bg-surface-secondary text-text-tertiary'
              }`}
            >
              {msg.direction === 'sent' ? <Send size={14} /> : <Bot size={14} />}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1.5">
                <span className={`text-[10px] font-black uppercase tracking-wider ${PLATFORM_COLORS[msg.platformId] || 'text-text-tertiary'}`}>
                  {msg.platformId}
                </span>
                <span className="text-[10px] text-text-quaternary">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="text-[9px] uppercase tracking-wider font-bold text-text-quaternary">
                  {msg.direction === 'sent' ? 'OUT' : 'IN'}
                </span>
              </div>
              <p className="text-[14px] text-text-secondary leading-relaxed font-medium break-words">{msg.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
