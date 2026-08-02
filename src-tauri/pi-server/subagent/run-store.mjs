import { randomUUID } from 'node:crypto'

const MAX_RECENT_RUNS = 100
const runs = new Map()

function publicRun(run) {
  if (!run) return null
  const { controller: _controller, ...snapshot } = run
  return { ...snapshot, budget: { ...snapshot.budget }, usage: { ...snapshot.usage } }
}

export function beginSubagentRun({ agent, task, budget, parent }) {
  const runId = randomUUID()
  const controller = new AbortController()
  const run = {
    runId,
    agent,
    task,
    parent: parent || 'unknown',
    status: 'running',
    stopReason: undefined,
    errorMessage: undefined,
    startedAt: Date.now(),
    finishedAt: undefined,
    durationMs: undefined,
    budget: {
      maxTurns: budget?.maxTurns || 1,
      maxTokens: budget?.maxTokens || 1,
      timeoutMs: budget?.timeoutMs || 1,
    },
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
    controller,
  }
  runs.set(runId, run)
  while (runs.size > MAX_RECENT_RUNS) {
    const oldest = runs.keys().next().value
    runs.delete(oldest)
  }
  return {
    runId,
    signal: controller.signal,
    abort: (reason = 'cancelled') => controller.abort(reason),
  }
}

export function updateSubagentRun(runId, updates = {}) {
  const run = runs.get(runId)
  if (!run) return null
  Object.assign(run, updates)
  if (updates.usage) run.usage = { ...run.usage, ...updates.usage }
  return publicRun(run)
}

export function completeSubagentRun(runId, result = {}) {
  const run = runs.get(runId)
  if (!run) return null
  run.status = result.exitCode === 0 ? 'completed' : result.stopReason === 'cancelled' ? 'cancelled' : 'failed'
  run.stopReason = result.stopReason
  run.errorMessage = result.errorMessage
  run.usage = { ...run.usage, ...(result.usage || {}) }
  run.finishedAt = Date.now()
  run.durationMs = run.finishedAt - run.startedAt
  return publicRun(run)
}

export function listSubagentRuns(limit = 50) {
  return [...runs.values()]
    .sort((left, right) => right.startedAt - left.startedAt)
    .slice(0, Math.max(1, Math.min(Number(limit) || 50, MAX_RECENT_RUNS)))
    .map(publicRun)
}

export function cancelSubagentRun(runId) {
  const run = runs.get(runId)
  if (!run || run.status !== 'running') return false
  run.status = 'cancelling'
  run.stopReason = 'cancelled'
  run.controller.abort('user-cancelled')
  return true
}

export function clearSubagentRuns() {
  for (const run of runs.values()) {
    if (run.status === 'running') run.controller.abort('store-cleared')
  }
  runs.clear()
}
