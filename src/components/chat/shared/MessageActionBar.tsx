import { CopyButton } from './CopyButton'

interface MessageActionBarProps {
  content?: string
  timestamp?: number
  align?: 'start' | 'end'
}

function formatRelativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function MessageActionBar({ content, timestamp, align = 'start' }: MessageActionBarProps) {
  return (
    <div
      className={`flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 ${
        align === 'end' ? 'justify-end' : 'justify-start'
      }`}
    >
      {timestamp && (
        <span className="text-[11px] text-[var(--color-text-tertiary)]">
          {formatRelativeTime(timestamp)}
        </span>
      )}
      {content && <CopyButton text={content} label="Copy" />}
    </div>
  )
}