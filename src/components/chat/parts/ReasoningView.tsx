import { useEffect, useRef } from 'react'
import { Brain } from 'lucide-react'
import { Collapsible } from '../shared/Collapsible'

interface ReasoningViewProps {
  text: string
  isActive?: boolean
}

function getPreviewLine(text: string): string {
  const lines = text.split('\n').filter((l) => l.trim())
  const first = lines[0] || ''
  return first.length > 80 ? first.slice(0, 80) + '...' : first
}

export function ReasoningView({ text, isActive = false }: ReasoningViewProps) {
  const hasCompletedRef = useRef(false)

  useEffect(() => {
    if (!isActive && !hasCompletedRef.current) {
      hasCompletedRef.current = true
    }
  }, [isActive])

  const label = isActive ? (
    <span className="flex items-center gap-1.5">
      <Brain size={14} className="text-[var(--color-primary)]" />
      <span>Thinking</span>
      <span className="thinking-dots" />
    </span>
  ) : (
    <span className="flex items-center gap-1.5">
      <Brain size={14} className="text-[var(--color-text-secondary)]" />
      <span>Thought</span>
      {text && (
        <span className="text-[var(--color-text-tertiary)] font-mono text-[11px] ml-2 truncate max-w-[300px]">
          {getPreviewLine(text)}
        </span>
      )}
    </span>
  )

  return (
    <Collapsible
      header={label}
      defaultExpanded={isActive}
      className="my-2"
    >
      <div
        className="font-mono text-[11px] leading-relaxed text-[var(--color-text-secondary)] whitespace-pre-wrap max-h-[300px] overflow-y-auto"
      >
        {text}
      </div>
    </Collapsible>
  )
}