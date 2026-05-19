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
    <div className="my-1 flex items-center gap-2 text-sm">
      {isStillActive && (
        <Loader2 size={14} className="text-[var(--color-accent)] animate-spin shrink-0" />
      )}
      {isStart && !isActive && (
        <CheckCircle size={14} className="text-[var(--color-success)] shrink-0" />
      )}
      {isFinish && reason === 'stop' && (
        <CheckCircle size={14} className="text-[var(--color-success)] shrink-0" />
      )}
      {isFinish && reason === 'error' && (
        <XCircle size={14} className="text-[var(--color-error)] shrink-0" />
      )}
      {isFinish && reason !== 'stop' && reason !== 'error' && (
        <CheckCircle size={14} className="text-[var(--color-text-secondary)] shrink-0" />
      )}
      <span className={
        isStillActive
          ? 'text-[var(--color-text)] font-medium'
          : reason === 'error'
            ? 'text-[var(--color-error)]'
            : 'text-[var(--color-text-secondary)]'
      }>
        {isStillActive ? 'Processing...' : isStart ? 'Step completed' : `Done (${reason || 'completed'})`}
      </span>
    </div>
  )
}