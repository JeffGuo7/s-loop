import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Brain, Sparkles, Wrench, Activity, ChevronDown, Clock, AlertCircle } from 'lucide-react'
import { ToolPartView } from '../parts'
import type { MessagePart, ToolPart } from '../../../types'

interface StackBlockProps {
  parts: MessagePart[]
  isStreaming: boolean
}

export function StackBlock({ parts, isStreaming }: StackBlockProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  const toolParts = parts.filter((p): p is ToolPart => p.type === 'tool')
  const hasRunningTool = toolParts.some(p => (p.state as any)?.status === 'running')
  const hasFailedTool = toolParts.some(p => (p.state as any)?.error)
  const toolCount = toolParts.length

  useEffect(() => {
    if (!isStreaming) {
      setElapsed(0)
      return
    }
    const start = Date.now()
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(interval)
  }, [isStreaming])

  const handleToggle = () => setExpanded(v => !v)

  if (parts.length === 0) return null

  return (
    <div className={`my-2 rounded-xl overflow-hidden border transition-all duration-500 ${
      isStreaming
        ? 'border-[var(--color-accent)]/30 bg-[var(--color-accent-subtle)]/20 shadow-sm'
        : 'border-[var(--color-border)] bg-[var(--color-surface-secondary)]/40 hover:border-[var(--color-accent)]/20'
    }`}>
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--color-surface-secondary)]/60"
      >
        <div className={`p-1.5 rounded-lg transition-all ${
          isStreaming
            ? 'bg-[var(--color-accent)] text-white'
            : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-tertiary)]'
        }`}>
          {isStreaming
            ? <Sparkles size={14} className="animate-spin-slow" />
            : <Brain size={14} />
          }
        </div>

        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className={`text-[11px] font-bold uppercase tracking-[0.2em] ${
            isStreaming ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-tertiary)]'
          }`}>
            {t('chat.parts.thoughtProcess')}
          </span>

          {isStreaming && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-tertiary)] font-mono">
              <Clock size={10} />{elapsed}s
            </span>
          )}

          {toolCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-quaternary)]">
              <Wrench size={10} />{toolCount}
            </span>
          )}

          {hasRunningTool && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-[var(--color-accent)] animate-pulse">
              <Activity size={10} />running
            </span>
          )}
          {hasFailedTool && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-red-500">
              <AlertCircle size={10} />failed
            </span>
          )}
        </div>

        <ChevronDown size={14} className={`text-[var(--color-text-quaternary)] transition-transform duration-300 ${
          expanded ? 'rotate-180' : ''
        }`} />
      </button>

      {expanded && (
        <div className="border-t border-[var(--color-border)]/50 animate-fade-in">
          {parts.map((part, idx) => {
            if (part.type === 'reasoning') {
              const text = (part as any).text || ''
              return (
                <div key={part.id || `r-${idx}`} className="font-mono text-[13px] leading-relaxed text-[var(--color-text-secondary)] whitespace-pre-wrap max-h-[300px] overflow-y-auto scrollbar-subtle p-4 bg-[var(--color-surface)]/50 border-b border-[var(--color-border)]/30 last:border-b-0">
                  {text}
                </div>
              )
            }
            if (part.type === 'tool') {
              return <ToolPartView key={part.id || `t-${idx}`} part={part as ToolPart} />
            }
            return null
          })}
        </div>
      )}
    </div>
  )
}
