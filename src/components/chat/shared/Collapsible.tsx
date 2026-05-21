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

  const hasCustomBg = className.includes('bg-')
  const hasCustomBorder = className.includes('border-')

  return (
    <div className={`rounded-2xl overflow-hidden transition-all duration-500 ${!hasCustomBorder ? 'border border-border' : ''} ${!hasCustomBg ? 'bg-surface-secondary/10' : ''} ${className}`}>
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-4 px-6 py-4 hover:bg-surface-secondary/40 transition-colors text-left"
      >
        <ChevronRight
          size={16}
          className="text-text-tertiary transition-transform duration-500"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
        />
        <div className="flex-1 min-w-0">{header}</div>
      </button>
      <div
        style={{
          maxHeight: expanded ? (contentHeight !== undefined ? contentHeight + 'px' : '2000px') : '0px',
          overflow: expanded ? 'visible' : 'hidden',
          transition: 'max-height 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div ref={contentRef} className="px-6 py-4 border-t border-border-light/50">
          {children}
        </div>
      </div>
    </div>
  )
}
