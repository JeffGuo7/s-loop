import { useEffect, useRef } from 'react'
import type { GoalStep } from '../../types/goal'
import { GoalStepCard } from './GoalStepCard'

interface GoalPlanProps {
  steps: GoalStep[]
  reasoning: string
  currentStepIndex: number
  autoExpand?: boolean
}

export function GoalPlan({ steps, reasoning, currentStepIndex, autoExpand = false }: GoalPlanProps) {
  const activeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [currentStepIndex])

  return (
    <div className="space-y-4">
      {/* Reasoning */}
      <div className="rounded-[20px] border border-border-light/70 bg-white/76 p-4 shadow-sm backdrop-blur-xl dark:bg-white/5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-black uppercase tracking-[0.15em] text-accent/50">Plan</span>
        </div>
        <p className="text-[11px] leading-relaxed text-text-secondary whitespace-pre-wrap">
          {reasoning}
        </p>
      </div>

      {/* Steps timeline */}
      <div className="relative pl-6">
        {/* Timeline line */}
        <div className="absolute left-[13px] top-0 bottom-0 w-px bg-border-light" />

        <div className="space-y-3">
          {steps.map((step) => (
            <div
              key={step.index}
              ref={step.index === currentStepIndex ? activeRef : undefined}
              className="relative"
            >
              {/* Timeline dot on the line */}
              <div className={`absolute left-[-17px] top-[18px] w-[9px] h-[9px] rounded-full border-2 ${
                step.status === 'completed' ? 'bg-green-500 border-green-500' :
                step.status === 'running' ? 'bg-accent border-accent animate-pulse' :
                step.status === 'failed' ? 'bg-red-500 border-red-500' :
                'bg-surface border-border-light'
              }`} />

              <GoalStepCard
                step={step}
                isActive={step.index === currentStepIndex}
                autoExpand={autoExpand}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
