import { create } from 'zustand'
import { getBaseUrl } from '../utils/piClient'
import { sendPlatformMessage } from '../utils/platformClient'
import { getErrorMessage } from '../utils/errors'
import { jsonRequest } from '../utils/http'
import type { ScheduledTask, TaskDelivery, TaskSchedule } from '../types/task'
import type { PlatformId } from '../types/platform'
import type { KiloMessage } from '../types'

interface TaskState {
  tasks: ScheduledTask[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  createTask: (data: CreateTaskInput) => Promise<ScheduledTask | null>
  removeTask: (id: string) => Promise<void>
  toggleTask: (id: string) => Promise<void>
  triggerRun: (id: string) => Promise<void>
  fetchOutput: (id: string) => Promise<{ timestamp: string; content: string; file?: string }[]>
}

export interface CreateTaskInput {
  name: string
  prompt: string
  schedule: TaskSchedule
  skills?: string[]
  contextFrom?: string[]
  model?: string
  provider?: string
  apiKey?: string
  workspaceDir?: string
  deliver?: TaskDelivery
  deliverSessionId?: string
  enabled?: boolean
}

const BASE = () => getBaseUrl()

async function deliverTaskResults(tasks: ScheduledTask[]) {
  const pending = tasks.filter((task) =>
    task.lastRunId &&
    task.lastRunId !== task.deliveredRunId &&
    task.deliver !== 'silent' &&
    (task.lastStatus === 'completed' || task.lastStatus === 'failed')
  )

  if (pending.length === 0) return

  const { useAppStore } = await import('./appStore')

  for (const task of pending) {
    try {
      const outputsRes = await fetch(`${BASE()}/tasks/${task.id}/output`)
      const outputs = outputsRes.ok ? await outputsRes.json() as Array<{ content: string }> : []
      const latest = outputs[0]?.content?.trim()
      if (!latest) continue

      if (task.deliver === 'chat') {
        const now = Date.now()
        const messageId = `task-${task.id}-${task.lastRunId}`
        const appStore = useAppStore.getState()
        let sessionId = task.deliverSessionId
        if (!sessionId) {
          sessionId = appStore.createSession()
        }
        if (!appStore.sessions.some((session) => session.id === sessionId)) {
          await appStore.loadFromDb()
        }
        if (!useAppStore.getState().sessions.some((session) => session.id === sessionId)) {
          sessionId = useAppStore.getState().createSession()
        }

        const message: KiloMessage = {
          info: {
            id: messageId,
            sessionID: sessionId,
            role: 'assistant',
            time: { created: now, completed: now },
          },
          parts: [
            {
              id: `${messageId}-text`,
              type: 'text',
              text: latest,
              sessionID: sessionId,
              messageID: messageId,
              time: { created: now, completed: now },
            },
          ],
        }
        useAppStore.getState().addMessage(sessionId, message)

        await fetch(`${BASE()}/tasks/${task.id}`, jsonRequest({
          deliverSessionId: sessionId,
          deliveredRunId: task.lastRunId,
          deliveryError: undefined,
        }, { method: 'PUT' }))
      } else {
        await sendPlatformMessage(task.deliver as PlatformId, latest)
        await fetch(`${BASE()}/tasks/${task.id}`, jsonRequest({
          deliveredRunId: task.lastRunId,
          deliveryError: undefined,
        }, { method: 'PUT' }))
      }
    } catch (err) {
      await fetch(`${BASE()}/tasks/${task.id}`, jsonRequest({
        deliveryError: getErrorMessage(err),
      }, { method: 'PUT' })).catch(() => {})
    }
  }
}

export const useTaskStore = create<TaskState>()((set, get) => ({
  tasks: [],
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null })
    try {
      const res = await fetch(`${BASE()}/tasks`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const tasks = await res.json()
      await deliverTaskResults(tasks)
      const refreshed = await fetch(`${BASE()}/tasks`)
      const finalTasks = refreshed.ok ? await refreshed.json() : tasks
      set({ tasks: finalTasks, loading: false })
    } catch (err) {
      set({ error: getErrorMessage(err), loading: false })
    }
  },

  createTask: async (data) => {
    try {
      const res = await fetch(`${BASE()}/tasks/create`, jsonRequest(data))
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const task = await res.json()
      set((s) => ({ tasks: [...s.tasks, task] }))
      return task
    } catch (err) {
      set({ error: getErrorMessage(err) })
      return null
    }
  },

  removeTask: async (id) => {
    try {
      await fetch(`${BASE()}/tasks/${id}`, { method: 'DELETE' })
      set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }))
    } catch (err) {
      set({ error: getErrorMessage(err) })
    }
  },

  toggleTask: async (id) => {
    const task = get().tasks.find((t) => t.id === id)
    if (!task) return
    try {
      await fetch(`${BASE()}/tasks/${id}`, jsonRequest({ enabled: !task.enabled }, { method: 'PUT' }))
      set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t)) }))
    } catch (err) {
      set({ error: getErrorMessage(err) })
    }
  },

  triggerRun: async (id) => {
    try {
      const appStore = await import('./appStore')
      const state = appStore.useAppStore.getState()
      const apiKey = state.providerConfigs[state.activeProvider]?.apiKey || ''
      const model = state.providerConfigs[state.activeProvider]?.model || ''
      await fetch(`${BASE()}/tasks/run/${id}`, jsonRequest({
        apiKey,
        defaultProvider: state.activeProvider,
        defaultModel: model,
        projectDir: state.workspaceDir || undefined,
      }))
      setTimeout(() => get().refresh(), 2000)
    } catch (err) {
      set({ error: getErrorMessage(err) })
    }
  },

  fetchOutput: async (id: string) => {
    try {
      const res = await fetch(`${BASE()}/tasks/${id}/output`)
      return res.ok ? await res.json() : []
    } catch { return [] }
  },
}))
