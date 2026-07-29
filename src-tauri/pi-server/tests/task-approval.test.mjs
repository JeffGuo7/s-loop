import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  createTask,
  getDueTasks,
  getTask,
  init,
  markTaskApprovalResuming,
  markTaskRunning,
  markTaskRun,
  markTaskWaitingForApproval,
} from '../task-scheduler.mjs'

test('a task can park for approval and resume without reserving another schedule', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snotra-task-approval-'))
  try {
    init(root)
    const task = createTask({
      name: 'approval task',
      prompt: 'write a report',
      schedule: {
        kind: 'once',
        runAt: new Date(Date.now() - 1_000).toISOString(),
        display: 'once',
      },
    })
    const running = markTaskRunning(task.id, { runId: 'run-1', trigger: 'manual' })
    assert.equal(running.lastStatus, 'running')
    assert.equal(running.enabled, false)

    const waiting = markTaskWaitingForApproval(task.id, 'run-1', 'approval-1')
    assert.equal(waiting.lastStatus, 'waiting_for_approval')
    assert.equal(waiting.pendingApprovalId, 'approval-1')
    assert.equal(getDueTasks().some((candidate) => candidate.id === task.id), false)

    const resumed = markTaskRunning(task.id, {
      runId: 'run-1',
      trigger: 'manual',
      resume: true,
    })
    assert.equal(resumed.lastStatus, 'running')
    assert.equal(resumed.pendingApprovalId, undefined)
    assert.equal(resumed.lastRunId, 'run-1')

    markTaskWaitingForApproval(task.id, 'run-1', 'approval-2')
    assert.equal(markTaskApprovalResuming(task.id, 'run-1').lastStatus, 'running')

    markTaskRun(task.id, 'completed', 'done', undefined, { runId: 'run-1' })
    assert.equal(getTask(task.id).lastStatus, 'completed')
    assert.equal(getTask(task.id).pendingApprovalId, undefined)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
