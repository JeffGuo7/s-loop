import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import type { StepStartPart, StepFinishPart } from '../../../types'

interface StepViewProps {
  part: StepStartPart | StepFinishPart
  isActive?: boolean
}

export function StepView({ part, isActive = false }: StepViewProps) {
  const isStart = part.type === 'step-start'
  const isFinish = part.type === 'step-finish'
  const reason = isFinish ? (part as StepFinishPart).reason : undefined
  const isStillActive = isStart && isActive

  return (
    <div className="flex items-center gap-3 py-1.5 px-1 group">
      <div className="flex items-center justify-center w-5 h-5 shrink-0">
        {isStillActive && (
          <Loader2 size={13} className="text-[var(--color-accent)] animate-spin" />
        )}
        {isStart && !isActive && (
          <CheckCircle size={13} className="text-[var(--color-success)] opacity-80" />
        )}
        {isFinish && reason === 'stop' && (
          <CheckCircle size={13} className="text-[var(--color-success)] opacity-80" />
        )}
        {isFinish && reason === 'error' && (
          <XCircle size={13} className="text-[var(--color-error)] opacity-80" />
        )}
        {isFinish && reason !== 'stop' && reason !== 'error' && (
          <CheckCircle size={13} className="text-[var(--color-text-tertiary)] opacity-80" />
        )}
      </div>
      <span className={`text-[11px] uppercase tracking-wider font-bold transition-colors ${
        isStillActive
          ? 'text-[var(--color-accent)]'
          : reason === 'error'
            ? 'text-[var(--color-error)] opacity-90'
            : 'text-[var(--color-text-tertiary)] group-hover:text-[var(--color-text-secondary)]'
      }`}>
        {isStillActive ? 'Thinking...' : isStart ? 'Sequence completed' : `Process ${reason || 'finished'}`}
      </span>
    </div>
  )
}
