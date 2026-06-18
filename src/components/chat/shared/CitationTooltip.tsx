import { useState, useRef } from 'react'

interface Citation {
  title?: string
  content?: string
  url?: string
}

interface CitationTooltipProps {
  citation: Citation
  children: React.ReactNode
}

export function CitationTooltip({ citation, children }: CitationTooltipProps) {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<number | null>(null)

  const show = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
    }
    timerRef.current = window.setTimeout(() => setVisible(true), 300)
  }

  const hide = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setVisible(false)
  }

  return (
    <span className="relative inline" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && citation && (
        <div
          className="absolute z-50 bottom-full left-0 mb-2 p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xl min-w-[240px] max-w-[360px] animate-fade-in"
          onMouseEnter={() => {
            if (timerRef.current !== null) {
              window.clearTimeout(timerRef.current)
              timerRef.current = null
            }
            setVisible(true)
          }}
          onMouseLeave={() => setVisible(false)}
        >
          {citation.title && (
            <p className="text-xs font-bold text-[var(--color-text)] mb-1">{citation.title}</p>
          )}
          {citation.content && (
            <p className="text-[11px] text-[var(--color-text-secondary)] line-clamp-3">{citation.content}</p>
          )}
          {citation.url && (
            <a
              href={citation.url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex text-[10px] font-bold text-[var(--color-accent)] hover:underline"
            >
              Read more →
            </a>
          )}
        </div>
      )}
    </span>
  )
}
