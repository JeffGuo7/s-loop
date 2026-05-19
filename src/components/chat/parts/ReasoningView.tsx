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
        <Brain size={14} className="text-[var(--color-accent)] animate-pulse" />
        <div className="absolute inset-0 bg-[var(--color-accent)] blur-md opacity-30 animate-pulse" />
      </div>
      <span className="text-xs font-bold uppercase tracking-widest text-[var(--color-accent)]">Reasoning</span>
      <div className="flex gap-1">
        <div className="w-1 h-1 bg-[var(--color-accent)] rounded-full animate-bounce [animation-delay:-0.3s]" />
        <div className="w-1 h-1 bg-[var(--color-accent)] rounded-full animate-bounce [animation-delay:-0.15s]" />
        <div className="w-1 h-1 bg-[var(--color-accent)] rounded-full animate-bounce" />
      </div>
    </span>
  ) : (
    <span className="flex items-center gap-3">
      <Brain size={14} className="text-[var(--color-text-tertiary)]" />
      <span className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">Thought Process</span>
      {text && (
        <span className="text-[10px] text-[var(--color-text-tertiary)] font-mono opacity-50 truncate max-w-[250px] hidden sm:inline">
          {getPreviewLine(text)}
        </span>
      )}
    </span>
  )

  return (
    <Collapsible
      header={label}
      defaultExpanded={isActive}
      className="my-4 border border-[var(--color-border)]/50 rounded-2xl bg-[var(--color-surface-secondary)]/30 overflow-hidden"
    >
      <div
        className="font-mono text-[11px] leading-relaxed text-[var(--color-text-secondary)] whitespace-pre-wrap max-h-[400px] overflow-y-auto p-4 bg-[var(--color-surface)]/50"
      >
        {text}
      </div>
    </Collapsible>
  )
}