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
    <div className="flex items-center gap-6 py-5 px-4 group transition-all hover:translate-x-2">
      <div className={`flex items-center justify-center w-9 h-9 shrink-0 rounded-[14px] transition-all duration-500 ${
        isStillActive 
          ? 'bg-accent/10 text-accent ring-2 ring-accent/20 shadow-lg shadow-accent/10' 
          : reason === 'error'
            ? 'bg-red-500/10 text-red-500 shadow-sm shadow-red-500/5'
            : 'bg-surface-secondary text-text-tertiary border border-border-light shadow-sm'
      }`}>
        {isStillActive && (
          <Loader2 size={18} className="animate-spin" />
        )}
        {isStart && !isActive && (
          <CheckCircle size={18} className="text-green-500" />
        )}
        {isFinish && reason === 'stop' && (
          <CheckCircle size={18} className="text-green-500" />
        )}
        {isFinish && reason === 'error' && (
          <XCircle size={18} />
        )}
        {isFinish && reason !== 'stop' && reason !== 'error' && (
          <Play size={16} className="fill-current" />
        )}
      </div>
      
      <div className="flex flex-col">
        <span className={`text-[14px] font-bold uppercase tracking-[0.2em] transition-colors ${
          isStillActive
            ? 'text-accent'
            : reason === 'error'
              ? 'text-red-500'
              : 'text-text-tertiary group-hover:text-text-secondary'
        }`}>
          {isStillActive ? 'Running sequence...' : isStart ? 'Sequence initialized' : `Step ${reason || 'finalized'}`}
        </span>
        {isStillActive && (
          <span className="text-[13px] text-text-tertiary opacity-50 animate-pulse font-bold mt-1 tracking-tight">
            Executing operations...
          </span>
        )}
      </div>
    </div>
  )
}
