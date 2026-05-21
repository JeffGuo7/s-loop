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
      <div className="flex items-center gap-4">
        <div className={`p-2.5 rounded-xl transition-all duration-700 ${
          hasActiveProcess 
            ? 'bg-accent text-white shadow-lg shadow-accent/30 animate-pulse' 
            : 'bg-surface-tertiary text-text-tertiary shadow-inner'
        }`}>
          {hasActiveProcess ? (
            <Sparkles size={16} className="animate-spin-slow" />
          ) : (
            <Layers size={16} />
          )}
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className={`text-[11px] font-black uppercase tracking-[0.3em] ${hasActiveProcess ? 'text-accent' : 'text-text-tertiary'}`}>
              {hasActiveProcess ? 'Live Orchestration' : 'Execution Logs'}
            </span>
            {hasActiveProcess && (
              <span className="flex h-1.5 w-1.5 rounded-full bg-accent animate-ping" />
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 opacity-70">
            {reasoningCount > 0 && (
              <div className="flex items-center gap-2 px-2 py-0.5 rounded-lg bg-surface-tertiary/50 border border-border-light shadow-sm">
                <Brain size={12} className="text-accent/60" />
                <span className="text-[10px] text-text-secondary font-black uppercase tracking-widest">{reasoningCount} {reasoningCount > 1 ? 'Thoughts' : 'Thought'}</span>
              </div>
            )}
            {toolCount > 0 && (
              <div className="flex items-center gap-2 px-2 py-0.5 rounded-lg bg-surface-tertiary/50 border border-border-light shadow-sm">
                <Wrench size={12} className="text-accent/60" />
                <span className="text-[10px] text-text-secondary font-black uppercase tracking-widest">{toolCount} {toolCount > 1 ? 'Tools' : 'Tool'}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="my-4 group/thought-stack relative">
      <Collapsible
        header={label}
        expanded={isExpanded}
        onToggle={setIsExpanded}
        className={`transition-all duration-700 border-none !bg-transparent !shadow-none overflow-visible`}
      >
        <div className="flex flex-col gap-2 py-3 px-2 overflow-visible">
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
