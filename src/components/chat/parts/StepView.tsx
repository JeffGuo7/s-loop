import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import type { StepStartPart, StepFinishPart } from '../../../types'

interface StepViewProps {
  part: StepStartPart | StepFinishPart
}

export function StepView({ part }: StepViewProps) {
  const isStart = part.type === 'step-start'
  const isFinish = part.type === 'step-finish'
  const reason = isFinish ? (part as StepFinishPart).reason : undefined

  return (
    <div className="my-1 flex items-center gap-2 text-sm">
      {isStart && (
        <Loader2 size={14} className="text-[var(--color-primary)] animate-spin shrink-0" />
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
        isStart
          ? 'text-[var(--color-text-primary)] font-medium'
          : reason === 'error'
            ? 'text-[var(--color-error)]'
            : 'text-[var(--color-text-secondary)]'
      }>
        {isStart ? 'Processing...' : `Done (${reason || 'completed'})`}
      </span>
    </div>
  )
}