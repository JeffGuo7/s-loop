import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

interface CollapsibleProps {
  header: ReactNode
  children: ReactNode
  defaultExpanded?: boolean
  expanded?: boolean
  onToggle?: (expanded: boolean) => void
  className?: string
}

export function Collapsible({
  header,
  children,
  defaultExpanded = false,
  expanded: controlledExpanded,
  onToggle,
  className = '',
}: CollapsibleProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded)
  const isControlled = controlledExpanded !== undefined
  const expanded = isControlled ? controlledExpanded : internalExpanded

  const contentRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState<number | undefined>(undefined)

  useEffect(() => {
    if (!isControlled) {
      setInternalExpanded(defaultExpanded)
    }
  }, [defaultExpanded, isControlled])

  useEffect(() => {
    if (!contentRef.current) return
    const observer = new ResizeObserver(([entry]) => {
      setContentHeight(entry.contentRect.height)
    })
    observer.observe(contentRef.current)
    return () => observer.disconnect()
  }, [])

  const handleToggle = useCallback(() => {
    const next = !expanded
    if (!isControlled) {
      setInternalExpanded(next)
    }
    onToggle?.(next)
  }, [expanded, isControlled, onToggle])

  return (
    <div className={`border border-(--color-border) rounded-xl overflow-hidden transition-colors hover:border-(--color-border-hover) ${className}`}>
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-3 px-4 py-3 bg-(--color-surface-secondary)/30 hover:bg-(--color-surface-secondary)/80 transition-colors text-left"
      >
        <ChevronRight
          size={16}
          className="text-(--color-text-tertiary) transition-transform duration-300"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
        />
        <span className="text-sm flex-1 min-w-0">{header}</span>
      </button>
      <div
        style={{
          maxHeight: expanded ? (contentHeight !== undefined ? contentHeight + 'px' : '800px') : '0px',
          overflow: 'hidden',
          transition: 'max-height var(--motion-collapse)',
        }}
      >
        <div ref={contentRef} className="px-4 py-4 border-t border-(--color-border-light) bg-(--color-surface)/50">
          {children}
        </div>
      </div>
    </div>
  )
}
