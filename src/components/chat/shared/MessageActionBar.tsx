import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { CopyButton } from './CopyButton'
import { SpeechButton } from './SpeechButton'

interface MessageActionBarProps {
  content?: string
  timestamp?: number
  align?: 'start' | 'end'
  speakable?: boolean
}

function formatRelativeTime(ts: number, t: TFunction): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return t('chat.time.justNow')
  if (diff < 3600) return t('chat.time.minutesAgo', { n: Math.floor(diff / 60) })
  if (diff < 86400) return t('chat.time.hoursAgo', { n: Math.floor(diff / 3600) })
  return t('chat.time.daysAgo', { n: Math.floor(diff / 86400) })
}

export function MessageActionBar({ content, timestamp, align = 'start', speakable = false }: MessageActionBarProps) {
  const { t, i18n } = useTranslation()
  return (
    <div
      className={`flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 ${
        align === 'end' ? 'justify-end' : 'justify-start'
      }`}
    >
      {timestamp && (
        <span className="text-[11px] text-(--color-text-tertiary)">
          {formatRelativeTime(timestamp, t)}
        </span>
      )}
      {content && <CopyButton text={content} label={t('chat.copy.copy')} />}
      {content && speakable && (
        <SpeechButton
          text={content}
          label={i18n.resolvedLanguage?.startsWith('zh') ? '朗读' : 'Speak'}
        />
      )}
    </div>
  )
}
