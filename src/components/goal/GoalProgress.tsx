import { Square } from 'lucide-react'
import type { GoalState, GoalStep } from '../../types/goal'

interface GoalProgressProps {
  goal: GoalState
  isRunning: boolean
  onAbort: () => void
}

export function GoalProgress({ goal, isRunning, onAbort }: GoalProgressProps) {
  const steps: GoalStep[] = goal.plan?.steps || []
  const total = steps.length
  const completed = steps.filter((s) => s.status === 'completed').length
  const failed = steps.filter((s) => s.status === 'failed').length
  const pct = total > 0 ? Math.round(((completed + failed) / total) * 100) : 0

  // Aggregate usage
  const totalTokens = steps.reduce((sum, s) => {
    if (s.result?.usage) {
      return sum + s.result.usage.input + s.result.usage.output
    }
    return sum
  }, 0)
  const totalCost = steps.reduce((sum, s) => {
    return sum + (s.result?.usage?.cost || 0)
  }, 0)

  const statusColor = (() => {
    if (goal.status === 'completed') return 'text-green-500'
    if (goal.status === 'failed' || goal.status === 'aborted') return 'text-red-500'
    return 'text-accent'
  })()

  return (
    <div className="rounded-[24px] border border-border-light/70 bg-white/76 p-5 shadow-sm backdrop-blur-xl dark:bg-white/5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-black uppercase tracking-[0.15em] ${statusColor}`}>
              {goal.status === 'planning' ? 'Planning...' :
               goal.status === 'executing' ? 'Executing' :
               goal.status === 'completed' ? 'Completed' :
               goal.status === 'failed' ? 'Failed' :
               goal.status === 'aborted' ? 'Aborted' :
               'Pending'}
            </span>
            <span className="text-[10px] font-bold text-text-tertiary">
              Step {goal.currentStepIndex + 1}/{total} · Iteration {goal.currentIteration}/{goal.maxIterations}
            </span>
          </div>
          <h3 className="mt-1 text-[15px] font-black tracking-tight text-text line-clamp-2">
            {goal.goal}
          </h3>
        </div>
        {isRunning && (
          <button
            onClick={onAbort}
            className="flex items-center gap-1.5 rounded-xl bg-red-500/10 px-3 py-1.5 text-[10px] font-black text-red-500 hover:bg-red-500/20 transition-colors"
          >
            <Square size={10} />
            Stop
          </button>
        )}
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] font-bold text-text-tertiary uppercase tracking-[0.1em]">Progress</span>
            <span className="text-[9px] font-bold text-text-tertiary font-mono">{pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-surface-secondary overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                goal.status === 'completed' ? 'bg-green-500' :
                goal.status === 'failed' ? 'bg-red-500' :
                'bg-accent'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2">
        <div className="rounded-2xl bg-surface-secondary/55 px-3 py-2.5">
          <div className="text-[8px] font-black uppercase tracking-[0.1em] text-text-tertiary">Steps</div>
          <div className="mt-1 text-[14px] font-black tracking-tight text-text">
            {completed}/{total}
          </div>
        </div>
        <div className="rounded-2xl bg-surface-secondary/55 px-3 py-2.5">
          <div className="text-[8px] font-black uppercase tracking-[0.1em] text-text-tertiary">Failed</div>
          <div className={`mt-1 text-[14px] font-black tracking-tight ${failed > 0 ? 'text-red-500' : 'text-text'}`}>
            {failed}
          </div>
        </div>
        <div className="rounded-2xl bg-surface-secondary/55 px-3 py-2.5">
          <div className="text-[8px] font-black uppercase tracking-[0.1em] text-text-tertiary">Tokens</div>
          <div className="mt-1 text-[14px] font-black tracking-tight text-text font-mono">
            {totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(0)}k` : totalTokens}
          </div>
        </div>
        <div className="rounded-2xl bg-surface-secondary/55 px-3 py-2.5">
          <div className="text-[8px] font-black uppercase tracking-[0.1em] text-text-tertiary">Cost</div>
          <div className="mt-1 text-[14px] font-black tracking-tight text-text font-mono">
            ${totalCost.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Progress notes */}
      {goal.progressNotes.length > 0 && (
        <div className="mt-3 space-y-1">
          {goal.progressNotes.map((note, i) => (
            <div key={i} className="text-[10px] text-text-tertiary font-mono">
              {note}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
