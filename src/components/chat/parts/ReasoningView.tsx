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
    <span className="flex items-center gap-6">
      <div className="relative flex items-center justify-center">
        <Sparkles size={20} className="text-accent animate-spin-slow" />
        <div className="absolute inset-0 bg-accent opacity-30 animate-pulse blur-lg" />
      </div>
      <span className="text-[14px] font-bold uppercase tracking-[0.3em] text-accent">Thinking</span>
      <div className="flex gap-2.5 ml-2">
        <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
        <div className="w-2 h-2 bg-accent rounded-full animate-pulse [animation-delay:0.2s]" />
        <div className="w-2 h-2 bg-accent rounded-full animate-pulse [animation-delay:0.4s]" />
      </div>
    </span>
  ) : (
    <span className="flex items-center gap-6">
      <Brain size={20} className="text-text-tertiary" />
      <span className="text-[14px] font-bold uppercase tracking-[0.3em] text-text-tertiary">Thought Process</span>
      {text && (
        <span className="text-[14px] text-text-quaternary font-mono truncate max-w-[320px] hidden sm:inline ml-4 opacity-50">
          {getPreviewLine(text)}
        </span>
      )}
    </span>
  )

  return (
    <div className="my-6 group/reasoning">
      <Collapsible
        header={label}
        expanded={isExpanded}
        onToggle={setIsExpanded}
        className={`transition-all duration-700 border border-black/[0.04] dark:border-white/[0.04] rounded-[24px] overflow-hidden ${
          isActive ? 'bg-accent-subtle/30 shadow-sm' : 'bg-transparent'
        }`}
      >
        <div
          className="font-mono text-[15px] leading-relaxed text-text-secondary whitespace-pre-wrap max-h-[600px] overflow-y-auto scrollbar-subtle pr-8 py-6 px-6 mt-6 border-t border-black/[0.04] dark:border-white/[0.04] bg-surface-secondary/20"
        >
          {text}
        </div>
      </Collapsible>
    </div>
  )
}

