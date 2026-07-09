import { create } from 'zustand'
import { getBaseUrl } from '../utils/piClient'
import { getErrorMessage } from '../utils/errors'
import { jsonRequest } from '../utils/http'
import { readSSEStream } from '../utils/sse'
import type { GoalState, GoalSSEEvent, GoalStep } from '../types/goal'

interface GoalStoreState {
  goals: GoalState[]
  loading: boolean
  error: string | null
  activeGoal: GoalState | null
  liveEvents: GoalSSEEvent[]
  isRunning: boolean
  abortFn: (() => void) | null

  fetchGoals: () => Promise<void>
  createGoal: (goal: string) => Promise<GoalState | null>
  removeGoal: (id: string) => Promise<void>
  startGoal: (id: string) => Promise<void>
  abortGoal: () => void
  clearActive: () => void
}

const BASE = () => getBaseUrl()

export const useGoalStore = create<GoalStoreState>((set, get) => ({
  goals: [],
  loading: false,
  error: null,
  activeGoal: null,
  liveEvents: [],
  isRunning: false,
  abortFn: null,

  fetchGoals: async () => {
    set({ loading: true, error: null })
    try {
      const res = await fetch(`${BASE()}/goals`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const goals = await res.json()
      set({ goals, loading: false })
    } catch (err) {
      set({ error: getErrorMessage(err), loading: false })
    }
  },

  createGoal: async (goal) => {
    try {
      const res = await fetch(`${BASE()}/goals/create`, jsonRequest({ goal }))
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const created = await res.json()
      set((s) => ({ goals: [created, ...s.goals] }))
      return created
    } catch (err) {
      set({ error: getErrorMessage(err) })
      return null
    }
  },

  removeGoal: async (id) => {
    try {
      await fetch(`${BASE()}/goals/${encodeURIComponent(id)}`, { method: 'DELETE' })
      set((s) => ({ goals: s.goals.filter((g) => g.id !== id) }))
    } catch (err) {
      set({ error: getErrorMessage(err) })
    }
  },

  startGoal: async (id) => {
    const { abortFn: prevAbort, goals } = get()
    if (prevAbort) prevAbort()

    const existing = goals.find(g => g.id === id)
    const cleanGoal: GoalState = existing
      ? { ...existing, status: 'running' as const, steps: [], finalResult: null }
      : { id, goal: '', status: 'running' as const, steps: [], finalResult: null, createdAt: Date.now(), updatedAt: Date.now() }
    set({ activeGoal: cleanGoal, liveEvents: [], isRunning: true, error: null })

    const controller = new AbortController()
    const abort = () => controller.abort()
    set({ abortFn: abort })

    try {
      const res = await fetch(`${BASE()}/goals/${encodeURIComponent(id)}/run`, {
        method: 'POST',
        signal: controller.signal,
      })

      if (!res.ok) {
        set({ error: `Server ${res.status}`, isRunning: false })
        return
      }

      const reader = res.body?.getReader()
      if (!reader) {
        set({ error: 'No response body', isRunning: false })
        return
      }

      await readSSEStream(reader, (eventType, data) => {
        if (eventType === 'goal_event') {
          set((s) => ({ liveEvents: [...s.liveEvents, data] }))

          if (data.type === 'goal_step_start') {
            set((s) => {
              if (!s.activeGoal) return s
              const newStep: GoalStep = {
                agent: data.agent,
                task: data.task,
                status: 'running',
              }
              return {
                activeGoal: {
                  ...s.activeGoal,
                  steps: [...s.activeGoal.steps, newStep],
                },
              }
            })
          } else if (data.type === 'goal_step_end') {
            set((s) => {
              if (!s.activeGoal) return s
              const steps = s.activeGoal.steps.map((step, i) =>
                i === data.stepIndex
                  ? { ...step, status: data.result?.exitCode === 0 ? 'completed' as const : 'failed' as const, result: data.result }
                  : step
              ) as GoalStep[]
              return { activeGoal: { ...s.activeGoal, steps } }
            })
          } else if (data.type === 'goal_done') {
            if (data.goalState) {
              set(() => ({
                activeGoal: data.goalState,
                isRunning: false,
              }))
            } else {
              set((s) => ({
                activeGoal: s.activeGoal ? { ...s.activeGoal, status: 'completed' as const } : null,
                isRunning: false,
              }))
            }
            get().fetchGoals()
          } else if (data.type === 'goal_error') {
            set((s) => ({
              error: data.message,
              isRunning: false,
              activeGoal: s.activeGoal ? { ...s.activeGoal, status: 'failed' as const, finalResult: data.message } : null,
            }))
          }
        } else if (eventType === 'done') {
          set({ isRunning: false, abortFn: null })
          return true
        }
      })
    } catch (err) {
      if ((err as any)?.name !== 'AbortError') {
        set({ error: getErrorMessage(err), isRunning: false })
      }
    }
  },

  abortGoal: () => {
    const { abortFn } = get()
    if (abortFn) {
      abortFn()
      set({ isRunning: false, abortFn: null })
    }
  },

  clearActive: () => {
    set({ activeGoal: null, liveEvents: [], isRunning: false, error: null })
  },
}))
