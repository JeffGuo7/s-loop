import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react'

interface CollapsibleProps {
  header: ReactNode
  children: ReactNode
  defaultExpanded?: boolean
  className?: string
  onToggle?: (expanded: boolean) => void
}

export function Collapsible({
  header,
  children,
  defaultExpanded = false,
  className = '',
  onToggle,
}: CollapsibleProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState<number | undefined>(undefined)

  useEffect(() => {
    if (!contentRef.current) return
    const observer = new ResizeObserver(([entry]) => {
      setContentHeight(entry.contentRect.height)
    })
    observer.observe(contentRef.current)
    return () => observer.disconnect()
  }, [])

  const handleToggle = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev
      onToggle?.(next)
      return next
    })
  }, [onToggle])

  return (
    <div className={`border border-[var(--color-border)]/50 rounded-lg overflow-hidden ${className}`}>
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-[var(--color-surface-dim)] hover:bg-[var(--color-border)]/30 transition-colors text-left"
      >
        <span
          className="text-[var(--color-text-secondary)] transition-transform duration-200 inline-block"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          ▶
        </span>
        <span className="text-sm flex-1">{header}</span>
      </button>
      <div
        style={{
          maxHeight: expanded ? (contentHeight !== undefined ? contentHeight + 'px' : '800px') : '0px',
          overflow: 'hidden',
          transition: 'max-height var(--motion-collapse)',
        }}
      >
        <div ref={contentRef} className="px-3 py-2.5 border-t border-[var(--color-border)]/30">
          {children}
        </div>
      </div>
    </div>
  )
}