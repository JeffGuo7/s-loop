import { useEffect, useRef, useCallback } from 'react'
import { useTaskStore } from '../stores'
import * as Pi from '../utils/piClient'

const POLL_INTERVAL = 10_000

export function useTaskScheduler() {
  const { tasks, startExecution, updateExecution } = useTaskStore()
  const timer = useRef<ReturnType<typeof setInterval>>(undefined)
  const busy = useRef(false)

  const runTask = useCallback(
    async (task: (typeof tasks)[number]) => {
      const exec = startExecution(task.id)
      let output = ''

      try {
        const session = await Pi.createSession()
        const result = await Pi.prompt(session.id, task.prompt)

        if (result.error) {
          updateExecution(exec.id, { status: 'failed', endTime: Date.now(), output, error: result.error })
        } else {
          output = result.text
          updateExecution(exec.id, { status: 'completed', endTime: Date.now(), output })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        updateExecution(exec.id, { status: 'failed', endTime: Date.now(), output, error: msg })
      }
    },
    [startExecution, updateExecution],
  )

  useEffect(() => {
    const tick = async () => {
      if (busy.current) return
      busy.current = true
      try {
        const now = Date.now()
        for (const task of useTaskStore.getState().tasks) {
          if (!task.enabled || task.status === 'running' || task.nextRun > now) continue
          await runTask(task)
          break
        }
      } finally {
        busy.current = false
      }
    }
    timer.current = setInterval(tick, POLL_INTERVAL)
    return () => clearInterval(timer.current)
  }, [runTask])

  return {}
}
