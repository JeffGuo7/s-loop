import { useState } from 'react'
import { Check, X, Loader2, Bot, ChevronRight } from 'lucide-react'
import type { GoalStep } from '../../types/goal'

interface GoalStepCardProps {
  step: GoalStep
  index: number
  isActive: boolean
  autoExpand?: boolean
}

export function GoalStepCard({ step, index, isActive, autoExpand = false }: GoalStepCardProps) {
  const [expanded, setExpanded] = useState(autoExpand && !!step.result)

  const statusIcon = (() => {
    switch (step.status) {
      case 'running':
        return <Loader2 size={12} className="animate-spin-slow text-accent" />
      case 'completed':
        return <Check size={12} className="text-green-500" strokeWidth={3} />
      case 'failed':
        return <X size={12} className="text-red-500" strokeWidth={3} />
      default:
        return null
    }
  })()

  const statusColor = (() => {
    switch (step.status) {
      case 'running': return 'border-accent/30 bg-accent/5'
      case 'completed': return 'border-green-500/20 bg-green-500/5'
      case 'failed': return 'border-red-500/20 bg-red-500/5'
      default: return 'border-border-light/60 bg-surface-secondary/30'
    }
  })()

  return (
    <div className={`rounded-[20px] border ${statusColor} transition-all duration-500 ${isActive ? 'ring-1 ring-accent/20' : ''}`}>
      <button
        onClick={() => step.result && setExpanded(!expanded)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left"
      >
        {/* Step number badge */}
        <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black ${
          step.status === 'completed' ? 'bg-green-500 text-white' :
          step.status === 'running' ? 'bg-accent text-white animate-pulse' :
          step.status === 'failed' ? 'bg-red-500 text-white' :
          'bg-surface-tertiary text-text-tertiary'
        }`}>
          {index + 1}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[12px] font-bold tracking-tight ${
              step.status === 'completed' ? 'text-green-600' :
              step.status === 'failed' ? 'text-red-600' :
              'text-text'
            }`}>
              {step.agent}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-secondary/60 px-2 py-0.5 text-[9px] font-bold text-text-tertiary">
              <Bot size={9} />
              {step.agent}
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-text-tertiary line-clamp-2">
            {step.task}
          </p>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          {statusIcon}
          {step.result && (
            <ChevronRight size={12} className={`text-text-tertiary transition-transform ${expanded ? 'rotate-90' : ''}`} />
          )}
        </div>
      </button>

      {/* Expanded result */}
      {expanded && step.result && (
        <div className="border-t border-black/[0.04] dark:border-white/[0.04] px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-[10px] font-bold uppercase tracking-[0.1em] ${
              step.result.exitCode === 0 ? 'text-green-500' : 'text-red-500'
            }`}>
              {step.result.exitCode === 0 ? 'Completed' : 'Failed'}
            </span>
            {step.result.usage && (
              <span className="text-[9px] text-text-quaternary font-mono">
                {step.result.usage.input + step.result.usage.output > 1000
                  ? `${((step.result.usage.input + step.result.usage.output) / 1000).toFixed(0)}k`
                  : step.result.usage.input + step.result.usage.output} tokens
                {' · '}{step.result.usage.turns} turns
              </span>
            )}
          </div>
          {step.result.finalOutput && (
            <pre className="font-mono text-[10px] leading-relaxed whitespace-pre-wrap max-h-[200px] overflow-y-auto rounded-[8px] p-3 bg-surface border border-black/[0.04] dark:border-white/[0.04] text-text-secondary">
              {step.result.finalOutput}
            </pre>
          )}
          {step.result.errorMessage && (
            <div className="mt-2 rounded-xl bg-red-500/5 border border-red-500/10 px-3 py-2">
              <span className="text-[10px] text-red-500">{step.result.errorMessage}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
