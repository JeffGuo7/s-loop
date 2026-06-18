import { useState, useRef } from 'react'

interface HyperlinkProps {
  href: string
  children: React.ReactNode
}

export function Hyperlink({ href, children }: HyperlinkProps) {
  const [showPreview, setShowPreview] = useState(false)
  const timerRef = useRef<number | null>(null)

  const handleMouseEnter = () => {
    timerRef.current = window.setTimeout(() => setShowPreview(true), 500)
  }

  const handleMouseLeave = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setShowPreview(false)
  }

  return (
    <span className="relative inline">
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="text-[var(--color-accent)] hover:underline underline-offset-2 cursor-pointer"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </a>
      {showPreview && (
        <div
          className="absolute z-50 bottom-full left-0 mb-2 p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xl min-w-[280px] max-w-[400px] animate-fade-in"
          onMouseEnter={() => {
            if (timerRef.current !== null) {
              window.clearTimeout(timerRef.current)
              timerRef.current = null
            }
            setShowPreview(true)
          }}
          onMouseLeave={() => setShowPreview(false)}
        >
          <div className="w-8 h-8 rounded-lg bg-[var(--color-accent-muted)] flex items-center justify-center mb-2">
            <span className="text-sm">🔗</span>
          </div>
          <p className="text-xs font-bold text-[var(--color-text)] truncate">{href}</p>
          <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1 break-all">{href}</p>
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold text-[var(--color-accent)] hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            Open link →
          </a>
        </div>
      )}
    </span>
  )
}
