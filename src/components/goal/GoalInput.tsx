import { useState } from 'react'
import { Target, Send } from 'lucide-react'

interface GoalInputProps {
  onSubmit: (goal: string, maxIterations: number) => void
  loading?: boolean
}

export function GoalInput({ onSubmit, loading }: GoalInputProps) {
  const [goal, setGoal] = useState('')
  const [maxIterations, setMaxIterations] = useState(5)

  const handleSubmit = () => {
    const trimmed = goal.trim()
    if (!trimmed || loading) return
    onSubmit(trimmed, maxIterations)
    setGoal('')
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-[560px] rounded-[28px] border border-border-light/70 bg-white/76 p-6 shadow-sm backdrop-blur-xl dark:bg-white/5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-accent/10 flex items-center justify-center">
            <Target size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="text-[16px] font-black tracking-tight text-text">New Goal</h2>
            <p className="text-[11px] text-text-tertiary">Describe what you want to achieve</p>
          </div>
        </div>

        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="e.g. Research React 19 new features and write a summary report"
          rows={4}
          className="w-full resize-none rounded-2xl border border-border-light bg-surface-secondary/55 px-4 py-3 text-[13px] text-text placeholder:text-text-quaternary outline-none transition-all focus:border-accent/30"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
        />

        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold text-text-tertiary uppercase tracking-[0.1em]">
              Max Iterations
            </label>
            <select
              value={maxIterations}
              onChange={(e) => setMaxIterations(parseInt(e.target.value, 10))}
              className="rounded-xl border border-border-light bg-surface-secondary/55 px-3 py-1.5 text-[11px] font-bold text-text outline-none focus:border-accent/30"
            >
              {[3, 5, 7, 10, 15].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleSubmit}
            disabled={!goal.trim() || loading}
            className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-[11px] font-black text-white shadow-lg shadow-accent/10 transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send size={12} />
            Start Goal
          </button>
        </div>
      </div>
    </div>
  )
}
