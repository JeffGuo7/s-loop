import assert from 'node:assert/strict'
import test from 'node:test'

import {
  beginSubagentRun,
  cancelSubagentRun,
  clearSubagentRuns,
  completeSubagentRun,
  listSubagentRuns,
  updateSubagentRun,
} from './run-store.mjs'

test('subagent runs expose budgets, progress, completion and diagnostics', () => {
  clearSubagentRuns()
  const started = beginSubagentRun({
    agent: 'reviewer',
    task: 'review',
    parent: 'chat',
    budget: { maxTurns: 5, maxTokens: 12000, timeoutMs: 30000 },
  })
  updateSubagentRun(started.runId, { usage: { input: 100, output: 25, turns: 1 } })
  completeSubagentRun(started.runId, {
    exitCode: 1,
    stopReason: 'token-limit',
    errorMessage: 'Token budget exceeded',
    usage: { input: 100, output: 25, turns: 1 },
  })

  const [run] = listSubagentRuns()
  assert.equal(run.runId, started.runId)
  assert.equal(run.status, 'failed')
  assert.equal(run.budget.maxTokens, 12000)
  assert.equal(run.usage.output, 25)
  assert.equal(run.stopReason, 'token-limit')
  assert.equal(Object.hasOwn(run, 'controller'), false)
})

test('a running subagent can be cancelled by run id', () => {
  clearSubagentRuns()
  const started = beginSubagentRun({ agent: 'coder', task: 'work', budget: {} })
  assert.equal(cancelSubagentRun(started.runId), true)
  assert.equal(started.signal.aborted, true)
  assert.equal(cancelSubagentRun(started.runId), false)
})
