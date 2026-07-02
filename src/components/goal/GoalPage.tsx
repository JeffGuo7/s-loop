import { useEffect, useState, useCallback } from 'react'
import { Loader2, Trash2, Target, Plus, MessageSquare, CheckCircle2, AlertCircle, Eye, Copy, Check } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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

  useEffect(() => {
    fetchGoals()
  }, []) // stable mount-only effect

  const handleCreate = async (goal: string) => {
    try {
      const created = await createGoal(goal)
      if (created) {
        startGoal(created.id)
      }
    } catch (err) {
      console.error('[GoalPage] handleCreate error:', err)
    }
  }

  const handleStartGoal = (id: string) => {
    startGoal(id)
  }

  const handleViewGoal = (goal: GoalState) => {
    useGoalStore.setState({ activeGoal: goal, isRunning: false, error: null })
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

  // Active goal without steps — still running or finished without subagent calls
  if (activeGoal && activeGoal.steps.length === 0) {
    const isRunning_ = activeGoal.status === 'running'
    const hasResult = !!activeGoal.finalResult
    return (
      <div className="flex-1 overflow-y-auto bg-[var(--color-bg)]">
        <div className="max-w-[680px] mx-auto p-6 space-y-6">
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
                {activeGoal.goal || 'Running goal...'}
              </span>
            </div>
          </div>

          <GoalProgress
            goal={activeGoal}
            isRunning={isRunning}
            onAbort={abortGoal}
          />

          {isRunning_ ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={24} className="animate-spin-slow text-accent" />
                <span className="text-[12px] font-bold text-text-tertiary">
                  Working on goal...
                </span>
              </div>
            </div>
          ) : hasResult ? (
            <div className="rounded-[24px] border border-accent/20 bg-accent/[0.03] p-6 shadow-sm backdrop-blur-xl">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-accent/15 flex items-center justify-center">
                    <CheckCircle2 size={16} className="text-accent" />
                  </div>
                  <span className="text-[12px] font-black text-text">
                    {activeGoal.status === 'completed' ? 'Goal Achieved' : 'Result'}
                  </span>
                </div>
                <CopyButton text={activeGoal.finalResult!} />
              </div>
              <ResultContent text={activeGoal.finalResult!} />
              <button
                onClick={clearActive}
                className="mt-4 rounded-xl bg-surface-secondary/70 px-4 py-2 text-[11px] font-bold text-text-secondary hover:text-text transition-colors"
              >
                Back to Goals
              </button>
            </div>
          ) : (
            <div className="rounded-[24px] border border-red-500/20 bg-red-500/[0.03] p-6">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle size={16} className="text-red-500" />
                <span className="text-[12px] font-black text-text">
                  {activeGoal.status === 'failed' ? 'Goal Failed' : activeGoal.status === 'aborted' ? 'Goal Aborted' : 'Goal Ended'}
                </span>
              </div>
              <p className="text-[11px] text-text-tertiary">
                {error || 'The goal did not produce a result.'}
              </p>
              <button
                onClick={clearActive}
                className="mt-4 rounded-xl bg-surface-secondary/70 px-4 py-2 text-[11px] font-bold text-text-secondary hover:text-text transition-colors"
              >
                Back to Goals
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Active goal with steps
  if (activeGoal && activeGoal.steps.length > 0) {
    const allDone = !isRunning && (activeGoal.status === 'completed' || activeGoal.status === 'failed' || activeGoal.status === 'aborted')

    return (
      <div className="flex-1 overflow-y-auto bg-[var(--color-bg)]">
        <div className="max-w-[680px] mx-auto p-6 space-y-6">
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
            {allDone && (
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

          {/* Result card — always shown when done */}
          {allDone && (
            <div className="rounded-[24px] border border-accent/20 bg-accent/[0.03] p-6 shadow-sm backdrop-blur-xl">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-accent/15 flex items-center justify-center">
                    {activeGoal.status === 'completed'
                      ? <CheckCircle2 size={16} className="text-accent" />
                      : <AlertCircle size={16} className="text-red-500" />
                    }
                  </div>
                  <div>
                    <span className="text-[12px] font-black text-text">Result</span>
                    <p className="text-[10px] text-text-tertiary">
                      {activeGoal.status === 'completed' ? 'Goal achieved' :
                       activeGoal.status === 'failed' ? 'Execution failed' : 'Aborted'}
                    </p>
                  </div>
                </div>
                {activeGoal.finalResult && (
                  <CopyButton text={activeGoal.finalResult} />
                )}
              </div>
              {activeGoal.finalResult ? (
                <div className="rounded-2xl bg-surface-secondary/50 p-4 border border-border-light/70 max-h-[500px] overflow-y-auto">
                  <div className="prose prose-sm max-w-none dark:prose-invert text-[11px] leading-relaxed text-text-secondary">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {activeGoal.finalResult}
                    </ReactMarkdown>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[11px] text-text-tertiary">
                    The agent completed execution. See step details below for results.
                  </p>
                  {activeGoal.steps.filter(s => s.result?.finalOutput).map((s, i) => (
                        <details key={i} className="group">
                          <summary className="cursor-pointer text-[11px] font-bold text-text-secondary hover:text-text transition-colors">
                            Step {i + 1}: {s.agent} — {s.task.slice(0, 50)} ({s.status})
                          </summary>
                          <pre className="mt-2 font-mono text-[10px] leading-relaxed whitespace-pre-wrap rounded-xl bg-surface-secondary/50 p-3 border border-border-light/70 text-text-secondary max-h-[200px] overflow-y-auto">
                            {s.result?.finalOutput || 'No output'}
                          </pre>
                        </details>
                      ))}
                </div>
              )}
            </div>
          )}

          <GoalPlan
            steps={activeGoal.steps}
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

        {error && (
          <div className="rounded-2xl bg-red-500/5 border border-red-500/10 px-4 py-3">
            <span className="text-[11px] font-medium text-red-500">{error}</span>
          </div>
        )}

        {/* Goal history — always visible as a proper list */}
        {goals.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] font-black uppercase tracking-[0.15em] text-text-tertiary">
                History
              </span>
              <span className="inline-flex items-center justify-center h-4 min-w-4 rounded-full bg-surface-secondary px-1.5 text-[9px] font-bold text-text-tertiary">
                {goals.length}
              </span>
            </div>

            <div className="space-y-2">
              {goals.map((goal) => (
                <div
                  key={goal.id}
                  onClick={() => goal.steps?.length > 0 ? handleViewGoal(goal) : null}
                  className={`rounded-[20px] border border-border-light/70 bg-white/76 p-4 shadow-sm backdrop-blur-xl dark:bg-white/5 ${goal.steps?.length > 0 ? 'cursor-pointer hover:border-accent/30 transition-colors' : ''}`}
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
                      {goal.steps?.length > 0 && (
                        <p className="mt-1 text-[10px] text-text-tertiary">
                          {goal.steps.length} steps · {goal.steps.filter(s => s.status === 'completed').length} completed
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {(goal.status === 'pending' || goal.status === 'failed') && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleStartGoal(goal.id) }}
                          className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-[10px] font-bold text-white shadow-sm hover:shadow-md transition-all"
                        >
                          <Plus size={10} />
                          Start
                        </button>
                      )}
                      {goal.steps?.length > 0 && (goal.status === 'completed' || goal.status === 'failed') && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleViewGoal(goal) }}
                          className="flex items-center gap-1 rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1.5 text-[10px] font-bold text-accent hover:bg-accent/20 transition-colors"
                        >
                          <Eye size={10} />
                          View
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeGoal(goal.id) }}
                        className="p-1.5 rounded-lg text-text-tertiary hover:text-red-500 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Reusable copy button ──────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [text])
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 rounded-lg bg-surface-secondary/70 px-2 py-1 text-[10px] font-bold text-text-tertiary hover:text-text transition-colors"
    >
      {copied ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// ── Result content with markdown rendering ──────────────────────────
function ResultContent({ text }: { text: string }) {
  return (
    <div>
      <div className="flex items-center justify-end mb-2">
        <CopyButton text={text} />
      </div>
      <div className="rounded-xl bg-surface-secondary/50 p-4 border border-border-light/70 max-h-[300px] overflow-y-auto">
        <div className="prose prose-sm max-w-none dark:prose-invert text-[11px] leading-relaxed text-text-secondary">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {text}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}
