import { Brain, Sparkles } from 'lucide-react'
import { Collapsible } from '../shared/Collapsible'
import { useEffect, useState } from 'react'

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
  const [isExpanded, setIsExpanded] = useState(isActive)

  // Auto-collapse when active state ends
  useEffect(() => {
    if (isActive) {
      setIsExpanded(true)
    } else {
      // Small delay for smooth transition after completion
      const timer = setTimeout(() => setIsExpanded(false), 500)
      return () => clearTimeout(timer)
    }
  }, [isActive])

  const label = isActive ? (
    <span className="flex items-center gap-3">
      <div className="relative flex items-center justify-center">
        <Sparkles size={13} className="text-(--color-accent) animate-spin-slow" />
        <div className="absolute inset-0 bg-(--color-accent) opacity-20 animate-pulse blur-md" />
      </div>
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-(--color-accent)">Thinking</span>
      <div className="flex gap-1.5 ml-1">
        <div className="w-1 h-1 bg-(--color-accent) rounded-full animate-pulse" />
        <div className="w-1 h-1 bg-(--color-accent) rounded-full animate-pulse [animation-delay:0.2s]" />
        <div className="w-1 h-1 bg-(--color-accent) rounded-full animate-pulse [animation-delay:0.4s]" />
      </div>
    </span>
  ) : (
    <span className="flex items-center gap-3">
      <Brain size={13} className="text-(--color-text-tertiary)" />
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-(--color-text-tertiary)">Thought Process</span>
      {text && (
        <span className="text-[10px] text-(--color-text-quaternary) font-mono truncate max-w-[240px] hidden sm:inline ml-2 opacity-60">
          {getPreviewLine(text)}
        </span>
      )}
    </span>
  )

  return (
    <div className="my-2 group/reasoning">
      <Collapsible
        header={label}
        expanded={isExpanded}
        onToggle={setIsExpanded}
        className={`transition-all duration-500 border border-black/[0.03] dark:border-white/[0.03] ${
          isActive ? 'bg-(--color-surface-secondary)/50' : 'bg-transparent'
        }`}
      >
        <div
          className="font-mono text-[11px] leading-relaxed text-(--color-text-secondary) whitespace-pre-wrap max-h-[400px] overflow-y-auto scrollbar-subtle pr-4 py-2 mt-2 border-t border-black/[0.03] dark:border-white/[0.03]"
        >
          {text}
        </div>
      </Collapsible>
    </div>
  )
}

