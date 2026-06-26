import { create } from 'zustand'
import { getBaseUrl } from '../utils/piClient'
import type { GoalState, GoalSSEEvent } from '../types/goal'

interface GoalStoreState {
  goals: GoalState[]
  loading: boolean
  error: string | null
  activeGoal: GoalState | null
  liveEvents: GoalSSEEvent[]
  isRunning: boolean
  abortFn: (() => void) | null

  fetchGoals: () => Promise<void>
  createGoal: (goal: string, maxIterations?: number) => Promise<GoalState | null>
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
      set({ error: err instanceof Error ? err.message : String(err), loading: false })
    }
  },

  createGoal: async (goal, maxIterations) => {
    try {
      const res = await fetch(`${BASE()}/goals/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, maxIterations: maxIterations || 5 }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const created = await res.json()
      set((s) => ({ goals: [created, ...s.goals] }))
      return created
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
      return null
    }
  },

  removeGoal: async (id) => {
    try {
      await fetch(`${BASE()}/goals/${encodeURIComponent(id)}`, { method: 'DELETE' })
      set((s) => ({ goals: s.goals.filter((g) => g.id !== id) }))
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  startGoal: async (id) => {
    const { abortFn: prevAbort, goals } = get()
    if (prevAbort) prevAbort()

    // Set activeGoal from existing list so UI transitions immediately
    const existing = goals.find(g => g.id === id)
    set({ activeGoal: existing || null, liveEvents: [], isRunning: true, error: null })

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

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        let lineEnd = buffer.indexOf('\n')
        while (lineEnd !== -1) {
          const line = buffer.slice(0, lineEnd)
          buffer = buffer.slice(lineEnd + 1)
          lineEnd = buffer.indexOf('\n')

          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith(':')) continue

          if (trimmed.startsWith('event: ')) {
            const eventType = trimmed.slice(7)
            const nextEnd = buffer.indexOf('\n')
            const dataLine = nextEnd === -1 ? buffer.trim() : buffer.slice(0, nextEnd).trim()
            if (dataLine.startsWith('data: ')) {
              try {
                const data = JSON.parse(dataLine.slice(6))
                if (eventType === 'goal_event') {
                  set((s) => ({ liveEvents: [...s.liveEvents, data] }))

                  if (data.type === 'goal_plan') {
                    set((s) => ({
                      activeGoal: s.activeGoal
                        ? { ...s.activeGoal, plan: data.plan, status: 'executing' }
                        : null,
                    }))
                  } else if (data.type === 'goal_done') {
                    set(() => ({
                      activeGoal: data.goalState,
                      isRunning: false,
                    }))
                    // Refresh goals list
                    get().fetchGoals()
                  } else if (data.type === 'goal_error') {
                    set({ error: data.message, isRunning: false })
                  }
                } else if (eventType === 'done') {
                  set({ isRunning: false, abortFn: null })
                  return
                }
              } catch { /* skip */ }
            }
            if (nextEnd !== -1) {
              buffer = buffer.slice(nextEnd + 1)
              lineEnd = buffer.indexOf('\n')
            }
          }
        }
      }
    } catch (err) {
      if ((err as any)?.name !== 'AbortError') {
        set({ error: err instanceof Error ? err.message : String(err), isRunning: false })
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
