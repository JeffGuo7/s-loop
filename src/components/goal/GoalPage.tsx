import { useEffect, useState } from 'react'
import { Loader2, Trash2, Target, Plus, MessageSquare } from 'lucide-react'
import { useGoalStore } from '../../stores/goalStore'
import { useAppStore } from '../../stores/appStore'
import { GoalInput } from './GoalInput'
import { GoalProgress } from './GoalProgress'
import { GoalPlan } from './GoalPlan'
import type { GoalState } from '../../types/goal'

export function GoalPage() {
  const {
    goals, error, activeGoal, isRunning,
    fetchGoals, createGoal, removeGoal, startGoal, abortGoal, clearActive,
  } = useGoalStore()

  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    fetchGoals()
  }, [fetchGoals])

  const handleCreate = async (goal: string, maxIterations: number) => {
    const created = await createGoal(goal, maxIterations)
    if (created) {
      startGoal(created.id)
    }
  }

  const handleStartGoal = (id: string) => {
    startGoal(id)
  }

  const handleSendToChat = (goal: GoalState) => {
    const sessionId = useAppStore.getState().createSession()
    useAppStore.getState().setActiveSession(sessionId)
    const now = Date.now()
    useAppStore.getState().addMessage(sessionId, {
      info: {
        id: `goal-msg-${goal.id}`,
        sessionID: sessionId,
        role: 'assistant',
        time: { created: now },
      },
      parts: [
        { id: `goal-part-${goal.id}`, sessionID: sessionId, messageID: `goal-msg-${goal.id}`, type: 'text', text: `# Goal Result: ${goal.goal}\n\n${goal.finalResult || 'Completed.'}` },
      ],
    })
  }

  // Planning / pre-plan state
  if (activeGoal && !activeGoal.plan && (activeGoal.status === 'planning' || activeGoal.status === 'executing')) {
    return (
      <div className="flex-1 overflow-y-auto bg-[var(--color-bg)]">
        <div className="max-w-[680px] mx-auto p-6 space-y-6">
          <GoalProgress
            goal={activeGoal}
            isRunning={isRunning}
            onAbort={abortGoal}
          />
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <Loader2 size={24} className="animate-spin-slow text-accent" />
              <span className="text-[12px] font-bold text-text-tertiary">
                Planning goal steps...
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Active goal with plan
  if (activeGoal && activeGoal.plan) {
    return (
      <div className="flex-1 overflow-y-auto bg-[var(--color-bg)]">
        <div className="max-w-[680px] mx-auto p-6 space-y-6">
          {/* Back + goal title */}
          <div className="flex items-center gap-3">
            <button
              onClick={clearActive}
              className="rounded-xl bg-surface-secondary/70 px-3 py-1.5 text-[10px] font-black text-text-tertiary hover:text-text transition-colors"
            >
              Back
            </button>
            <div className="flex items-center gap-2">
              <Target size={16} className="text-accent" />
              <span className="text-[14px] font-black tracking-tight text-text line-clamp-1">
                {activeGoal.goal}
              </span>
            </div>
            <div className="flex-1" />
            {!isRunning && activeGoal.finalResult && (
              <button
                onClick={() => handleSendToChat(activeGoal)}
                className="flex items-center gap-1.5 rounded-xl bg-accent/10 px-3 py-1.5 text-[10px] font-black text-accent hover:bg-accent/20 transition-colors"
              >
                <MessageSquare size={11} />
                Send to Chat
              </button>
            )}
          </div>

          <GoalProgress
            goal={activeGoal}
            isRunning={isRunning}
            onAbort={abortGoal}
          />

          <GoalPlan
            steps={activeGoal.plan.steps}
            reasoning={activeGoal.plan.reasoning}
            currentStepIndex={activeGoal.currentStepIndex}
          />
        </div>
      </div>
    )
  }

  // Goal list / input
  return (
    <div className="flex-1 overflow-y-auto bg-[var(--color-bg)]">
      <div className="max-w-[680px] mx-auto p-6 space-y-6">
        <GoalInput onSubmit={handleCreate} loading={isRunning} />

        {/* Error */}
        {error && (
          <div className="rounded-2xl bg-red-500/5 border border-red-500/10 px-4 py-3">
            <span className="text-[11px] font-medium text-red-500">{error}</span>
          </div>
        )}

        {/* Goal history */}
        {goals.length > 0 && (
          <div>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-text-tertiary hover:text-text transition-colors mb-3"
            >
              {showHistory ? '▼' : '▶'} History ({goals.length})
            </button>

            {showHistory && (
              <div className="space-y-2">
                {goals.map((goal) => (
                  <div
                    key={goal.id}
                    className="rounded-[20px] border border-border-light/70 bg-white/76 p-4 shadow-sm backdrop-blur-xl dark:bg-white/5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black ${
                            goal.status === 'completed' ? 'bg-green-500/10 text-green-500' :
                            goal.status === 'failed' || goal.status === 'aborted' ? 'bg-red-500/10 text-red-500' :
                            'bg-accent/10 text-accent'
                          }`}>
                            {goal.status}
                          </span>
                          <span className="text-[9px] text-text-quaternary font-mono">
                            {new Date(goal.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="mt-1 text-[12px] font-bold text-text line-clamp-2">{goal.goal}</p>
                        {goal.plan && (
                          <p className="mt-1 text-[10px] text-text-tertiary">
                            {goal.plan.steps.length} steps · {goal.plan.steps.filter(s => s.status === 'completed').length} completed
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {(goal.status === 'pending' || goal.status === 'failed') && (
                          <button
                            onClick={() => handleStartGoal(goal.id)}
                            className="flex items-center gap-1 rounded-lg bg-accent/10 px-2.5 py-1.5 text-[10px] font-bold text-accent hover:bg-accent/20 transition-colors"
                          >
                            <Plus size={10} />
                            Start
                          </button>
                        )}
                        <button
                          onClick={() => removeGoal(goal.id)}
                          className="p-1.5 rounded-lg text-text-tertiary hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
