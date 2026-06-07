import { create } from 'zustand'
import { getBaseUrl } from '../utils/piClient'
import type { ScheduledTask, TaskSchedule } from '../types/task'

interface TaskState {
  tasks: ScheduledTask[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  createTask: (data: CreateTaskInput) => Promise<ScheduledTask | null>
  removeTask: (id: string) => Promise<void>
  toggleTask: (id: string) => Promise<void>
  triggerRun: (id: string) => Promise<void>
  fetchOutput: (id: string) => Promise<{ timestamp: string; content: string }[]>
}

export interface CreateTaskInput {
  name: string
  prompt: string
  schedule: TaskSchedule
  skills?: string[]
  contextFrom?: string[]
  model?: string
  provider?: string
  deliver?: 'chat' | 'silent'
  enabled?: boolean
}

const BASE = () => getBaseUrl()

export const useTaskStore = create<TaskState>()((set, get) => ({
  tasks: [],
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null })
    try {
      const res = await fetch(`${BASE()}/tasks`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      set({ tasks: await res.json(), loading: false })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), loading: false })
    }
  },

  createTask: async (data) => {
    try {
      const res = await fetch(`${BASE()}/tasks/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const task = await res.json()
      set((s) => ({ tasks: [...s.tasks, task] }))
      return task
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
      return null
    }
  },

  removeTask: async (id) => {
    try {
      await fetch(`${BASE()}/tasks/${id}`, { method: 'DELETE' })
      set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }))
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  toggleTask: async (id) => {
    const task = get().tasks.find((t) => t.id === id)
    if (!task) return
    try {
      await fetch(`${BASE()}/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !task.enabled }),
      })
      set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t)) }))
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  triggerRun: async (id) => {
    try {
      // Pass the active API key so pi-server can run the task
      const appStore = await import('./appStore')
      const state = appStore.useAppStore.getState()
      const apiKey = state.providerConfigs[state.activeProvider]?.apiKey || ''
      await fetch(`${BASE()}/tasks/run/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      })
      setTimeout(() => get().refresh(), 2000)
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  fetchOutput: async (id: string) => {
    try {
      const res = await fetch(`${BASE()}/tasks/${id}/output`)
      return res.ok ? await res.json() : []
    } catch { return [] }
  },
}))
