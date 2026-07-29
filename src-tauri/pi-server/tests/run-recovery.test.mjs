import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { initAuditStore, listAuditEvents } from '../audit-store.mjs'
import {
  createGoal,
  getGoal,
  initGoalPersistence,
  updateGoal,
} from '../goal-loop/persistence.mjs'
import {
  createPlatformRun,
  getPlatformRun,
  initPlatformRunStore,
  updatePlatformRun,
} from '../platform-run-store.mjs'
import {
  createTask,
  getTask,
  init as initTasks,
  markTaskRunning,
} from '../task-scheduler.mjs'

test('startup marks uncertain task, goal, and platform executions interrupted', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snotra-run-recovery-'))
  try {
    initAuditStore(root)

    initTasks(root)
    const task = createTask({
      name: 'recovery task',
      prompt: 'work',
      schedule: { kind: 'interval', minutes: 30, display: 'every 30m' },
    })
    markTaskRunning(task.id, { runId: 'task-run', trigger: 'scheduled' })

    initGoalPersistence(root)
    const goal = createGoal({ goal: 'recovery goal' })
    updateGoal(goal.id, {
      status: 'running',
      lastRunId: 'goal-run',
      steps: [{ agent: 'coder', task: 'work', status: 'running' }],
    })

    initPlatformRunStore(root)
    const platformRun = createPlatformRun({
      platformId: 'telegram',
      sessionId: 'telegram_recovery',
      incoming: {
        messageId: 'message-recovery',
        conversationId: 'chat-recovery',
        text: 'work',
      },
    })
    updatePlatformRun(platformRun.id, { status: 'resuming' })

    initTasks(root)
    initGoalPersistence(root)
    initPlatformRunStore(root)

    assert.equal(getTask(task.id).lastStatus, 'failed')
    assert.match(getTask(task.id).lastError, /restart/)
    assert.equal(getGoal(goal.id).status, 'failed')
    assert.match(getGoal(goal.id).finalResult, /restart/)
    assert.equal(getGoal(goal.id).steps[0].status, 'failed')
    assert.equal(getPlatformRun(platformRun.id).status, 'interrupted')

    const interrupted = listAuditEvents({ limit: 20 })
      .filter((event) => event.type === 'run.interrupted')
    assert.equal(interrupted.length, 3)
    assert.deepEqual(
      new Set(interrupted.map((event) => event.surface)),
      new Set(['task', 'goal', 'platform']),
    )
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
