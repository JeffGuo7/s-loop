import { useRef, useEffect } from 'react'
import type { GoalStep } from '../../types/goal'
import { GoalStepCard } from './GoalStepCard'

interface GoalPlanProps {
  steps: GoalStep[]
}

export function GoalPlan({ steps }: GoalPlanProps) {
  const listEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (listEndRef.current) {
      listEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [steps.length])

  if (steps.length === 0) return null

  return (
    <div className="relative pl-6">
      {/* Timeline line */}
      <div className="absolute left-[13px] top-0 bottom-0 w-px bg-border-light" />

      <div className="space-y-3">
        {steps.map((step, i) => (
          <div key={i} className="relative">
            {/* Timeline dot */}
            <div className={`absolute left-[-17px] top-[18px] w-[9px] h-[9px] rounded-full border-2 ${
              step.status === 'completed' ? 'bg-green-500 border-green-500' :
              step.status === 'running' ? 'bg-accent border-accent animate-pulse' :
              step.status === 'failed' ? 'bg-red-500 border-red-500' :
              'bg-surface border-border-light'
            }`} />

            <GoalStepCard
              step={step}
              index={i}
              isActive={step.status === 'running'}
              autoExpand={step.status === 'running' || (i === steps.length - 1 && step.status === 'completed')}
            />
          </div>
        ))}
        <div ref={listEndRef} />
      </div>
    </div>
  )
}
