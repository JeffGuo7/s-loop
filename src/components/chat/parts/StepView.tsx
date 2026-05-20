import { CheckCircle, XCircle, Loader2, Play } from 'lucide-react'
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
    <div className="flex items-center gap-3 py-2 px-2 group transition-all hover:translate-x-0.5">
      <div className={`flex items-center justify-center w-6 h-6 shrink-0 rounded-lg transition-all duration-500 ${
        isStillActive 
          ? 'bg-(--color-accent)/10 text-(--color-accent) ring-1 ring-(--color-accent)/20' 
          : reason === 'error'
            ? 'bg-red-500/10 text-red-500'
            : 'bg-(--color-surface-secondary) text-(--color-text-tertiary)'
      }`}>
        {isStillActive && (
          <Loader2 size={13} className="animate-spin" />
        )}
        {isStart && !isActive && (
          <CheckCircle size={13} className="text-green-500 opacity-80" />
        )}
        {isFinish && reason === 'stop' && (
          <CheckCircle size={13} className="text-green-500 opacity-80" />
        )}
        {isFinish && reason === 'error' && (
          <XCircle size={13} />
        )}
        {isFinish && reason !== 'stop' && reason !== 'error' && (
          <Play size={11} className="fill-current" />
        )}
      </div>
      
      <div className="flex flex-col">
        <span className={`text-[11px] font-bold uppercase tracking-[0.1em] transition-colors ${
          isStillActive
            ? 'text-(--color-accent)'
            : reason === 'error'
              ? 'text-red-500 opacity-90'
              : 'text-(--color-text-tertiary) group-hover:text-(--color-text-secondary)'
        }`}>
          {isStillActive ? 'Running sequence...' : isStart ? 'Sequence initialized' : `Step ${reason || 'finalized'}`}
        </span>
        {isStillActive && (
          <span className="text-[10px] text-(--color-text-tertiary) opacity-60 animate-pulse">
            Executing operations...
          </span>
        )}
      </div>
    </div>
  )
}
