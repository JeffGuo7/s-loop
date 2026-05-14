import { useState, ReactNode } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'

interface CollapsibleProps {
  header: ReactNode
  children: ReactNode
  defaultExpanded?: boolean
  className?: string
}

export function Collapsible({ header, children, defaultExpanded = false, className = '' }: CollapsibleProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className={`border border-[var(--color-border)] rounded-lg overflow-hidden ${className}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-[var(--color-surface-dim)] hover:bg-[var(--color-border)] transition-colors text-left"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="text-sm">{header}</span>
      </button>
      {expanded && (
        <div className="px-3 py-2 border-t border-[var(--color-border)]">
          {children}
        </div>
      )}
    </div>
  )
}
