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
    <span className="flex items-center gap-3">
      <div className="relative">
        <Brain size={14} className="text-(--color-accent) animate-pulse" />
        <div className="absolute inset-0 bg-(--color-accent) opacity-30 animate-pulse blur-sm" />
      </div>
      <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-(--color-accent)">Reasoning</span>
      <div className="flex gap-1">
        <div className="w-1 h-1 bg-(--color-accent) rounded-full animate-bounce [animation-delay:-0.3s]" />
        <div className="w-1 h-1 bg-(--color-accent) rounded-full animate-bounce [animation-delay:-0.15s]" />
        <div className="w-1 h-1 bg-(--color-accent) rounded-full animate-bounce" />
      </div>
    </span>
  ) : (
    <span className="flex items-center gap-3">
      <Brain size={14} className="text-(--color-text-tertiary)" />
      <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-(--color-text-tertiary)">Thought Process</span>
      {text && (
        <span className="text-[10px] text-(--color-text-quaternary) font-mono truncate max-w-[200px] hidden sm:inline ml-2">
          {getPreviewLine(text)}
        </span>
      )}
    </span>
  )

  return (
    <Collapsible
      header={label}
      defaultExpanded={isActive}
      className="my-3 shadow-sm"
    >
      <div
        className="font-mono text-[11px] leading-relaxed text-(--color-text-secondary) whitespace-pre-wrap max-h-[400px] overflow-y-auto scrollbar-subtle pr-2"
      >
        {text}
      </div>
    </Collapsible>
  )
}
