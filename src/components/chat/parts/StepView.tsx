import { StepStartPart, StepFinishPart } from '../../../types'
import { Zap, Coins } from 'lucide-react'

interface StepViewProps {
  part: StepStartPart | StepFinishPart
}

export function StepView({ part }: StepViewProps) {
  if (part.type === 'step-start') {
    return (
      <div className="flex items-center gap-2 px-2 py-1 text-xs text-[var(--color-text-secondary)] border-l-2 border-[var(--color-primary)] my-1">
        <Zap size={12} />
        <span>Step started</span>
      </div>
    )
  }

  // step-finish
  const tokens = part.tokens
  const cost = part.cost

  return (
    <div className="flex items-center gap-3 px-2 py-1 text-xs text-[var(--color-text-secondary)] border-l-2 border-green-500 my-1">
      <Zap size={12} className="text-green-500" />
      <span>Step completed</span>
      {tokens && (
        <span className="text-xs">
          {tokens.input + tokens.output} tokens
        </span>
      )}
      {cost && cost > 0 && (
        <span className="flex items-center gap-1 text-xs">
          <Coins size={10} />
          ${cost.toFixed(4)}
        </span>
      )}
    </div>
  )
}