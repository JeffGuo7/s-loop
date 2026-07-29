import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const MAX_RUNS = 200
let runsFile = ''

function loadRaw() {
  if (!runsFile || !existsSync(runsFile)) return []
  try {
    const parsed = JSON.parse(readFileSync(runsFile, 'utf-8'))
    return Array.isArray(parsed) ? parsed : (parsed.runs || [])
  } catch {
    return []
  }
}

function saveRaw(runs) {
  if (!runsFile) throw new Error('Platform run store is not initialized')
  const kept = runs
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-MAX_RUNS)
  const tempFile = `${runsFile}.tmp`
  writeFileSync(
    tempFile,
    JSON.stringify({ runs: kept, updatedAt: new Date().toISOString() }, null, 2),
    'utf-8',
  )
  renameSync(tempFile, runsFile)
}

export function initPlatformRunStore(baseDir) {
  const dir = join(baseDir, 'platform-runs')
  mkdirSync(dir, { recursive: true })
  runsFile = join(dir, 'runs.json')

  const runs = loadRaw()
  let changed = false
  for (const run of runs) {
    if (run.status === 'running' || run.status === 'resuming') {
      run.status = 'interrupted'
      run.error = 'Platform execution was interrupted by application restart'
      run.updatedAt = Date.now()
      changed = true
    }
  }
  if (changed) saveRaw(runs)
  return runsFile
}

export function getPlatformRun(id) {
  return loadRaw().find((run) => run.id === id) || null
}

export function findPlatformRun(platformId, messageId) {
  return loadRaw().find((run) =>
    run.platformId === platformId && run.incoming?.messageId === messageId
  ) || null
}

export function createPlatformRun(data) {
  const existing = findPlatformRun(data.platformId, data.incoming?.messageId)
  if (existing) return existing

  const runs = loadRaw()
  const now = Date.now()
  const run = {
    id: randomUUID(),
    runId: randomUUID(),
    status: 'running',
    platformId: data.platformId,
    sessionId: data.sessionId,
    incoming: data.incoming,
    sendOptions: data.sendOptions || {},
    createdAt: now,
    updatedAt: now,
  }
  runs.push(run)
  saveRaw(runs)
  return run
}

export function updatePlatformRun(id, updates) {
  const runs = loadRaw()
  const index = runs.findIndex((run) => run.id === id)
  if (index < 0) return null
  runs[index] = {
    ...runs[index],
    ...updates,
    updatedAt: Date.now(),
  }
  saveRaw(runs)
  return runs[index]
}
