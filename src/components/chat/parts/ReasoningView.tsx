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

  // Don't render anything if there's no text and it's not active
  if (!text && !isActive) return null

  const label = isActive ? (
    <span className="flex items-center gap-6">
      <div className="relative flex items-center justify-center">
        <Sparkles size={16} className="text-accent animate-spin-slow" />
      </div>
      <span className="text-[12px] font-bold uppercase tracking-[0.3em] text-accent">Thinking</span>
    </span>
  ) : (
    <span className="flex items-center gap-6">
      <Brain size={16} className="text-text-tertiary" />
      <span className="text-[12px] font-bold uppercase tracking-[0.3em] text-text-tertiary">Thought Process</span>
    </span>
  )

  return (
    <div className="my-1 group/reasoning">
      <Collapsible
        header={label}
        expanded={isExpanded}
        onToggle={setIsExpanded}
        className={`transition-all duration-700 border border-black/[0.04] dark:border-white/[0.04] rounded-[12px] overflow-hidden ${
          isActive ? 'bg-accent-subtle/30 shadow-sm' : 'bg-surface-secondary/50 hover:bg-surface-secondary transition-colors'
        }`}
      >
        <div
          className="font-mono text-[13px] leading-relaxed text-text-secondary whitespace-pre-wrap max-h-[400px] overflow-y-auto scrollbar-subtle pr-4 py-3 px-4 border-t border-black/[0.04] dark:border-white/[0.04] bg-surface-secondary/20"
        >
          {text}
        </div>
      </Collapsible>
    </div>
  )
}

