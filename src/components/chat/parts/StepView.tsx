import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import type { StepPart } from '../../../types'

interface StepViewProps {
  part: StepPart
}

export function StepView({ part }: StepViewProps) {
  const isRunning = part.state === 'running'
  const isCompleted = part.state === 'completed'
  const isError = part.state === 'error'

  return (
    <div className="my-2 flex items-center gap-2 text-sm">
      {isRunning && (
        <Loader2 size={14} className="text-[var(--color-primary)] animate-spin shrink-0" />
      )}
      {isCompleted && (
        <CheckCircle size={14} className="text-[var(--color-success)] shrink-0" />
      )}
      {isError && (
        <XCircle size={14} className="text-[var(--color-error)] shrink-0" />
      )}
      {!isRunning && !isCompleted && !isError && (
        <div className="w-3.5 h-3.5 rounded-full border border-[var(--color-border)] shrink-0" />
      )}
      <span className={
        isRunning
          ? 'text-[var(--color-text-primary)] font-medium'
          : isError
            ? 'text-[var(--color-error)]'
            : 'text-[var(--color-text-secondary)]'
      }>
        {part.text || part.name || 'Step'}
      </span>
    </div>
  )
}