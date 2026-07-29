import { create } from 'zustand'
import type { ApprovalRequest } from '../types/approval'
import { getBaseUrl } from '../utils/piClient'

interface ApprovalState {
  approvals: ApprovalRequest[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  decide: (id: string, decision: 'approve' | 'deny') => Promise<void>
}

export const useApprovalStore = create<ApprovalState>()((set, get) => ({
  approvals: [],
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null })
    try {
      const query = new URLSearchParams()
      query.append('status', 'pending')
      query.append('status', 'approved')
      const response = await fetch(`${getBaseUrl()}/approvals?${query}`)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      set({ approvals: await response.json(), loading: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        loading: false,
      })
    }
  },

  decide: async (id, decision) => {
    try {
      const response = await fetch(`${getBaseUrl()}/approvals/${id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      set((state) => ({
        approvals: state.approvals.filter((approval) => approval.id !== id),
        error: null,
      }))
      const { useTaskStore } = await import('./taskStore')
      setTimeout(() => useTaskStore.getState().refresh(), 250)
      setTimeout(() => get().refresh(), 500)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },
}))
