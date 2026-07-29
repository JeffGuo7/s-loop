import { useEffect } from 'react'
import { useTaskStore } from '../stores'
import { useApprovalStore } from '../stores/approvalStore'

/**
 * Hook that refreshes task list periodically from pi-server.
 * The actual scheduling is handled server-side by task-scheduler.mjs.
 * This hook just keeps the frontend in sync.
 */
export function useTaskScheduler() {
  const refresh = useTaskStore((s) => s.refresh)
  const loading = useTaskStore((s) => s.loading)
  const refreshApprovals = useApprovalStore((s) => s.refresh)

  useEffect(() => {
    // Initial load
    refresh()
    refreshApprovals()

    // Poll every 30s for status updates
    const id = setInterval(() => {
      refresh()
      refreshApprovals()
    }, 30_000)
    return () => clearInterval(id)
  }, [refresh, refreshApprovals])

  return { loading }
}
