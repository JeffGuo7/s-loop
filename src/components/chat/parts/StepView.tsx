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
    <div className="my-1 flex items-center gap-2 text-sm rounded-full bg-(--color-surface-secondary) px-3 py-1.5 w-fit border border-(--color-border-light)">
      {isStillActive && (
        <Loader2 size={14} className="text-(--color-accent) animate-spin shrink-0" />
      )}
      {isStart && !isActive && (
        <CheckCircle size={14} className="text-(--color-success) shrink-0" />
      )}
      {isFinish && reason === 'stop' && (
        <CheckCircle size={14} className="text-(--color-success) shrink-0" />
      )}
      {isFinish && reason === 'error' && (
        <XCircle size={14} className="text-(--color-error) shrink-0" />
      )}
      {isFinish && reason !== 'stop' && reason !== 'error' && (
        <CheckCircle size={14} className="text-(--color-text-secondary) shrink-0" />
      )}
      <span className={
        isStillActive
          ? 'text-(--color-text) font-medium'
          : reason === 'error'
            ? 'text-(--color-error)'
            : 'text-(--color-text-secondary)'
      }>
        {isStillActive ? 'Processing...' : isStart ? 'Step completed' : `Done (${reason || 'completed'})`}
      </span>
    </div>
  )
}
