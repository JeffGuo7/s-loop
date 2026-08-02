import { CheckCircle2, Circle, LoaderCircle, ShieldCheck, Square, XCircle } from 'lucide-react'
import type { GoalState, GoalStep } from '../../types/goal'

interface GoalProgressProps {
  goal: GoalState
  isRunning: boolean
  onAbort: () => void
}

export function GoalProgress({ goal, isRunning, onAbort }: GoalProgressProps) {
  const steps: GoalStep[] = goal.steps || []
  const planSteps = goal.plan?.steps || []
  const total = planSteps.length || steps.length
  const completed = planSteps.length
    ? planSteps.filter((step) => step.status === 'completed' && step.achieved === true).length
    : steps.filter((step) => step.status === 'completed').length
  const failed = planSteps.length
    ? planSteps.filter((step) => step.status === 'failed' || step.achieved === false).length
    : steps.filter((step) => step.status === 'failed').length
  const reviewed = planSteps.length
    ? planSteps.filter((step) => step.checked).length
    : completed + failed
  const pct = total > 0 ? Math.round((reviewed / total) * 100) : 0

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
    if (goal.status === 'waiting_for_approval') return 'text-amber-500'
    return 'text-accent'
  })()

  const statusLabel = (() => {
    switch (goal.status) {
      case 'running': return 'Running'
      case 'waiting_for_approval': return 'Waiting for approval'
      case 'completed': return 'Completed'
      case 'failed': return 'Failed'
      case 'aborted': return 'Aborted'
      default: return 'Pending'
    }
  })()

  return (
    <div className="rounded-[24px] border border-border-light/70 bg-white/76 p-5 shadow-sm backdrop-blur-xl dark:bg-white/5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-black uppercase tracking-[0.15em] ${statusColor}`}>
              {statusLabel}
            </span>
            {total > 0 && (
              <span className="text-[10px] font-bold text-text-tertiary">
                {reviewed}/{total} checked
              </span>
            )}
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

      {/* Enforced plan and per-step verification */}
      {planSteps.length > 0 && (
        <div className="mb-4 space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[9px] font-black uppercase tracking-[0.12em] text-text-tertiary">
              Execution plan
            </span>
            <span className="text-[9px] font-bold text-text-quaternary">
              {goal.currentIteration}/{goal.maxIterations} iterations
            </span>
          </div>
          {planSteps.map((step) => {
            const isRunning = step.status === 'running'
            const isFailed = step.status === 'failed' || step.achieved === false
            const isVerified = step.checked && step.achieved === true
            const StepIcon = isVerified
              ? CheckCircle2
              : isFailed
                ? XCircle
                : isRunning
                  ? LoaderCircle
                  : Circle
            return (
              <div
                key={step.index}
                className={`rounded-2xl border px-3 py-3 transition-colors ${
                  isRunning
                    ? 'border-accent/30 bg-accent/6'
                    : isFailed
                      ? 'border-red-500/20 bg-red-500/5'
                      : 'border-border-light/70 bg-surface-secondary/35'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <StepIcon
                    size={15}
                    className={`mt-0.5 shrink-0 ${
                      isVerified ? 'text-green-500' : isFailed ? 'text-red-500' : isRunning ? 'animate-spin text-accent' : 'text-text-quaternary'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[12px] font-black text-text">
                        {step.index + 1}. {step.name}
                      </span>
                      <span className="rounded-full bg-surface px-2 py-0.5 text-[9px] font-bold text-text-tertiary">
                        {step.agent}
                      </span>
                      {step.checked && (
                        <span className={`inline-flex items-center gap-1 text-[9px] font-black ${isVerified ? 'text-green-500' : 'text-red-500'}`}>
                          <ShieldCheck size={10} />
                          {isVerified ? 'Verified' : 'Needs work'}
                        </span>
                      )}
                    </div>
                    {(step.description || step.task) && (
                      <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-text-tertiary">
                        {step.description || step.task}
                      </p>
                    )}
                    {step.checkNote && (
                      <p className={`mt-1.5 text-[10px] font-medium ${isVerified ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                        {step.checkNote}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          {goal.plan?.reasoning && (
            <details className="px-1 text-[10px] text-text-tertiary">
              <summary className="cursor-pointer font-bold text-text-quaternary hover:text-text-tertiary">
                Planning rationale
              </summary>
              <p className="mt-1.5 leading-relaxed">{goal.plan.reasoning}</p>
            </details>
          )}
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2">
        <div className="rounded-2xl bg-surface-secondary/55 px-3 py-2.5">
          <div className="text-[8px] font-black uppercase tracking-[0.1em] text-text-tertiary">Steps</div>
          <div className="mt-1 text-[14px] font-black tracking-tight text-text">
            {completed}/{total || '-'}
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
            {totalTokens >= 1000 ? `${(totalTokens / 1000).toFixed(0)}k` : totalTokens || '-'}
          </div>
        </div>
        <div className="rounded-2xl bg-surface-secondary/55 px-3 py-2.5">
          <div className="text-[8px] font-black uppercase tracking-[0.1em] text-text-tertiary">Cost</div>
          <div className="mt-1 text-[14px] font-black tracking-tight text-text font-mono">
            ${totalCost.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  )
}
