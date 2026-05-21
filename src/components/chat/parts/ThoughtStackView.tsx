import { useState, useMemo } from 'react'
import { Brain, Sparkles, Wrench, Layers } from 'lucide-react'
import { Collapsible } from '../shared/Collapsible'
import { ReasoningView } from './ReasoningView'
import { ToolPartView } from './ToolPartView'
import type { MessagePart, ToolPart } from '../../../types'

interface ThoughtStackViewProps {
  parts: MessagePart[]
  isStreaming?: boolean
}

export function ThoughtStackView({ parts, isStreaming = false }: ThoughtStackViewProps) {
  const [isExpanded, setIsExpanded] = useState(isStreaming)

  // Identify if any part is still active
  const hasActiveProcess = useMemo(() => {
    return parts.some(part => {
      if (part.type === 'reasoning') return isStreaming
      if (part.type === 'tool') {
        const state = (part as ToolPart).state as Record<string, unknown>
        return state?.status === 'running'
      }
      return false
    })
  }, [parts, isStreaming])

  // Count types
  const reasoningCount = parts.filter(p => p.type === 'reasoning').length
  const toolCount = parts.filter(p => p.type === 'tool').length

  const label = (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-3">
        <div className={`p-1.5 rounded-lg ${hasActiveProcess ? 'bg-accent/10 text-accent' : 'bg-surface-tertiary text-text-tertiary'}`}>
          {hasActiveProcess ? (
            <Sparkles size={14} className="animate-spin-slow" />
          ) : (
            <Layers size={14} />
          )}
        </div>
        <div className="flex flex-col">
          <span className={`text-[10px] font-bold uppercase tracking-[0.2em] ${hasActiveProcess ? 'text-accent' : 'text-text-tertiary'}`}>
            {hasActiveProcess ? 'Processing' : 'Execution Logs'}
          </span>
          <div className="flex items-center gap-2 mt-0.5">
            {reasoningCount > 0 && (
              <span className="text-[11px] text-text-secondary font-medium flex items-center gap-1">
                <Brain size={10} className="opacity-50" /> {reasoningCount} {reasoningCount > 1 ? 'Thoughts' : 'Thought'}
              </span>
            )}
            {reasoningCount > 0 && toolCount > 0 && <span className="w-1 h-1 rounded-full bg-border-light" />}
            {toolCount > 0 && (
              <span className="text-[11px] text-text-secondary font-medium flex items-center gap-1">
                <Wrench size={10} className="opacity-50" /> {toolCount} {toolCount > 1 ? 'Tools' : 'Tool'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="my-2 group/thought-stack relative">
      {/* Visual Stack Layers - Decorative - Adjusted to be more compact and not obscured */}
      <div className="absolute -bottom-0.5 left-3 right-3 h-2 bg-black/[0.02] dark:bg-white/[0.02] border border-black/[0.03] dark:border-white/[0.03] rounded-[14px] -z-10 translate-y-0.5" />
      
      <Collapsible
        header={label}
        expanded={isExpanded}
        onToggle={setIsExpanded}
        className={`transition-all duration-700 border rounded-[16px] overflow-hidden ${
          hasActiveProcess 
            ? 'bg-accent-subtle/10 shadow-md shadow-accent/5 border-accent/20' 
            : 'bg-surface-secondary/30 hover:bg-surface-secondary/50 border-black/[0.05] dark:border-white/[0.05] shadow-sm transition-colors'
        }`}
      >
        <div className="flex flex-col gap-1 py-1.5 px-1.5">
          {parts.map((part, idx) => {
            if (part.type === 'reasoning') {
              return (
                <div key={`stack-res-${idx}`} className="transition-all duration-300">
                  <ReasoningView text={part.text} isActive={isStreaming && idx === parts.length - 1} />
                </div>
              )
            }
            if (part.type === 'tool') {
              return (
                <div key={`stack-tool-${idx}`} className="transition-all duration-300">
                  <ToolPartView part={part as ToolPart} />
                </div>
              )
            }
            return null
          })}
        </div>
      </Collapsible>
    </div>
  )
}
