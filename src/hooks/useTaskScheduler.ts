import { useEffect, useRef, useCallback } from 'react'
import { useTaskStore } from '../stores'
import * as OpenCode from '../utils/opencodeClient'

const POLL_INTERVAL = 10_000 // 10 seconds

export function useTaskScheduler() {
  const {
    tasks,
    startExecution,
    updateExecution,
    toggleTask,
  } = useTaskStore()
  const timer = useRef<ReturnType<typeof setInterval>>(undefined)
  const busy = useRef(false)

  const runTask = useCallback(
    async (task: (typeof tasks)[number]) => {
      const exec = startExecution(task.id)
      let output = ''

      try {
        // Create OpenCode session for this task run
        const session = await OpenCode.createSession(`Task: ${task.name}`)

        await OpenCode.prompt(session.id, task.prompt, {
          onPartUpdated: (_sessionID, _messageID, _partID, part) => {
            // Collect text from text parts
            if (part.type === 'text') {
              output += part.text
            }
          },
          onPartDelta: (_sessionID, _messageID, _partID, delta) => {
            output += delta
          },
          onMessageUpdated: () => {
            // Could update metadata here
          },
          onComplete: () => {
            updateExecution(exec.id, {
              status: 'completed',
              endTime: Date.now(),
              output,
            })
          },
          onError: (err) => {
            updateExecution(exec.id, {
              status: 'failed',
              endTime: Date.now(),
              output,
              error: err.message,
            })
          },
        }, undefined) // No model specified, use default
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        updateExecution(exec.id, {
          status: 'failed',
          endTime: Date.now(),
          output,
          error: msg,
        })

        // Auto-disable task on connection failure
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
          toggleTask(task.id)
        }
      }
    },
    [startExecution, updateExecution, toggleTask],
  )

  useEffect(() => {
    const tick = async () => {
      if (busy.current) return
      busy.current = true

      try {
        const now = Date.now()
        for (const task of useTaskStore.getState().tasks) {
          if (!task.enabled) continue
          if (task.status === 'running') continue
          if (task.nextRun > now) continue

          // Due — execute it
          await runTask(task)
          break // one per tick to avoid concurrency
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
