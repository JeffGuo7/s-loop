/**
 * Task scheduler — cron engine for S-Loop.
 * Inspired by hermes-agent-main's cron/jobs.py design.
 *
 * Tasks are stored in {s-loop_data}/tasks/tasks.json
 * Execution output saved to {s-loop_data}/tasks/output/{taskId}/{timestamp}.md
 *
 * The scheduler runs inside pi-server tick() every 60 seconds.
 * It does NOT need the frontend to be open — survives app restart.
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import cronParser from 'cron-parser'

const TICK_INTERVAL = 60_000  // check every 60s
const ONESHOT_GRACE_MS = 120_000  // 2-min grace for one-shot tasks
const RUNNING_STALE_MS = 15 * 60_000
const MAX_CONCURRENT_RUNS = 2
const _activeRuns = new Map()

// Paths resolved at init time
let _tasksDir = ''
let _tasksFile = ''
let _outputDir = ''

function _initPaths(baseDir) {
  _tasksDir = join(baseDir, 'tasks')
  _outputDir = join(_tasksDir, 'output')
  _tasksFile = join(_tasksDir, 'tasks.json')
  mkdirSync(_tasksDir, { recursive: true })
  mkdirSync(_outputDir, { recursive: true })
}

// ─── Schedule / time helpers ─────────────────────────────

function _computeNextRun(schedule, lastRunAt) {
  const now = Date.now()

  switch (schedule.kind) {
    case 'once': {
      if (!schedule.runAt) return null
      const target = new Date(schedule.runAt).getTime()
      if (lastRunAt && target <= now) return null  // already ran
      if (target <= now) return now + 5000  // overdue — run in 5s
      return target
    }
    case 'interval': {
      const min = schedule.minutes || 30
      if (lastRunAt) return lastRunAt + min * 60_000
      return now + min * 60_000
    }
    case 'cron': {
      if (!schedule.expr) return null
      try {
        const interval = cronParser.parseExpression(schedule.expr, {
          currentDate: lastRunAt ? new Date(lastRunAt) : new Date(),
        })
        return interval.next().getTime()
      } catch { return null }
    }
    default: return null
  }
}

function _graceSeconds(schedule) {
  const MIN = 120, MAX = 7200
  if (schedule.kind === 'interval') {
    return Math.max(MIN, Math.min((schedule.minutes || 30) * 60 / 2, MAX))
  }
  if (schedule.kind === 'cron' && schedule.expr) {
    try {
      const interval = cronParser.parseExpression(schedule.expr)
      const first = interval.next().getTime()
      const second = interval.next().getTime()
      return Math.max(MIN, Math.min((second - first) / 2000, MAX))
    } catch { return MIN }
  }
  return MIN
}

// ─── Task persistence ───────────────────────────────────

function _loadTasksRaw() {
  if (!existsSync(_tasksFile)) return []
  try {
    const data = JSON.parse(readFileSync(_tasksFile, 'utf-8'))
    // Stored format: { tasks: [...], updatedAt: "..." }
    return Array.isArray(data) ? data : (data.tasks || [])
  } catch { return [] }
}

function _saveTasks(tasks) {
  writeFileSync(_tasksFile, JSON.stringify({ tasks, updatedAt: new Date().toISOString() }, null, 2))
}

export function loadTasks() {
  return _loadTasksRaw()
}

export function getTask(taskId) {
  return _loadTasksRaw().find(t => t.id === taskId) || null
}

export function createTask(taskData) {
  const tasks = _loadTasksRaw()
  const id = randomUUID()
  const now = Date.now()
  const schedule = taskData.schedule
  const nextRunAt = _computeNextRun(schedule)

  const task = {
    id,
    name: taskData.name || 'Untitled Task',
    prompt: taskData.prompt || '',
    schedule,
    skills: taskData.skills || [],
    contextFrom: taskData.contextFrom || undefined,
    model: taskData.model || undefined,
    provider: taskData.provider || undefined,
    apiKey: taskData.apiKey || '',
    workspaceDir: taskData.workspaceDir || undefined,
    deliver: taskData.deliver || 'chat',
    deliverSessionId: taskData.deliverSessionId || undefined,
    deliveredRunId: undefined,
    deliveryError: undefined,
    enabled: taskData.enabled !== false,
    repeat: taskData.repeat || undefined,
    nextRunAt,
    lastRunAt: null,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastRunId: undefined,
    lastTrigger: undefined,
    lastStatus: 'pending',
    lastError: undefined,
    createdAt: now,
  }

  tasks.push(task)
  _saveTasks(tasks)
  return task
}

export function updateTask(taskId, updates) {
  const tasks = _loadTasksRaw()
  const idx = tasks.findIndex(t => t.id === taskId)
  if (idx === -1) return null
  tasks[idx] = { ...tasks[idx], ...updates }
  _saveTasks(tasks)
  return tasks[idx]
}

export function removeTask(taskId) {
  const tasks = _loadTasksRaw().filter(t => t.id !== taskId)
  _saveTasks(tasks)
  return true
}

export function getDueTasks() {
  const now = Date.now()
  const tasks = _loadTasksRaw()
  const due = []
  let changed = false

  for (const task of tasks) {
    if (!task.enabled) continue
    if (task.lastStatus === 'running') {
      const startedAt = task.lastStartedAt || task.lastRunAt || now
      if (now - startedAt > RUNNING_STALE_MS) {
        task.lastStatus = 'failed'
        task.lastError = 'Recovered from stale running state'
        task.lastFinishedAt = now
        task.lastRunId = undefined
        if (!task.nextRunAt && task.enabled && task.schedule.kind !== 'once') {
          task.nextRunAt = _computeNextRun(task.schedule, startedAt)
        }
        changed = true
      } else {
        continue
      }
    }

    const nextRun = task.nextRunAt
    if (!nextRun) continue

    if (nextRun <= now) {
      // Check grace window for recurring tasks (prevent burst after downtime)
      const grace = _graceSeconds(task.schedule) * 1000
      if (now - nextRun > grace) {
        // Fast-forward
        const newNext = _computeNextRun(task.schedule, now)
        if (newNext) {
          task.nextRunAt = newNext
          changed = true
        }
        continue
      }
      due.push(task)
    }
  }

  if (changed) {
    _saveTasks(tasks)
  }

  return due
}

export function markTaskRunning(taskId, runMeta = {}) {
  const tasks = _loadTasksRaw()
  const task = tasks.find(t => t.id === taskId)
  if (!task) return null

  const now = Date.now()
  if (!task.enabled) return null
  if (task.lastStatus === 'running') return null

  task.lastStatus = 'running'
  task.lastError = undefined
  task.lastStartedAt = now
  task.lastRunId = runMeta.runId || randomUUID()
  task.lastTrigger = runMeta.trigger || 'scheduled'
  task.nextRunAt = _computeNextRun(task.schedule, now)

  if (!task.nextRunAt && task.schedule.kind === 'once') {
    task.enabled = false
  }

  _saveTasks(tasks)
  return { ...task }
}

export function markTaskRun(taskId, status, output, error, runMeta = {}) {
  const tasks = _loadTasksRaw()
  const task = tasks.find(t => t.id === taskId)
  if (!task) return null

  const now = Date.now()
  task.lastRunAt = now
  task.lastFinishedAt = now
  task.lastStatus = status
  task.lastError = error || undefined
  task.deliveryError = undefined
  if (runMeta.runId) {
    task.lastRunId = runMeta.runId
  }
  if (runMeta.trigger) {
    task.lastTrigger = runMeta.trigger
  }

  // Increment repeat count
  if (task.repeat) {
    task.repeat.completed = (task.repeat.completed || 0) + 1
    if (task.repeat.times && task.repeat.completed >= task.repeat.times) {
      task.enabled = false
      task.nextRunAt = null
      _saveTasks(tasks)
      return task
    }
  }

  // Compute next run when it was not already reserved before execution
  if (task.enabled && task.nextRunAt == null && task.schedule.kind !== 'once') {
    task.nextRunAt = _computeNextRun(task.schedule, now)
  }
  if (!task.nextRunAt && task.schedule.kind === 'once') {
    task.enabled = false  // one-shot completed
  }

  _saveTasks(tasks)
  return task
}

export function saveTaskOutput(taskId, content) {
  const dir = join(_outputDir, taskId)
  mkdirSync(dir, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = join(dir, `${timestamp}.md`)
  writeFileSync(file, content, 'utf-8')
  return file
}

export function getTaskOutputs(taskId) {
  const dir = join(_outputDir, taskId)
  if (!existsSync(dir)) return []
  const files = readdirSync(dir).sort().reverse().slice(0, 10)
  return files.map(f => ({
    timestamp: f.replace(/\.md$/, '').replace(/-/g, ':').replace(/T/, ' ').replace(/.\d+Z/, ''),
    content: readFileSync(join(dir, f), 'utf-8'),
    file: f,
  }))
}

// ─── Execution ───────────────────────────────────────────

/**
 * Run one task. This is called by tick() or manually via /tasks/run/:id.
 * Returns { success, output, error }.
 *
 * The caller must provide the pi-agent-core's Agent class and apiKey resolver,
 * since the scheduler doesn't own those dependencies.
 */
export async function runTask(task, deps) {
  const { apiKey } = deps
  const startTime = Date.now()
  const runId = randomUUID()
  let output = ''
  let error = undefined
  let activeTask = null

  if (_activeRuns.has(task.id)) {
    return { success: false, output: '', error: 'Task is already running' }
  }

  activeTask = markTaskRunning(task.id, {
    runId,
    trigger: deps.trigger || 'scheduled',
  })

  if (!activeTask) {
    return { success: false, output: '', error: 'Task could not be reserved for execution' }
  }

  _activeRuns.set(task.id, runId)

  try {
    // Build prompt with skills + context from chain
    let fullPrompt = activeTask.prompt

    // Load skills — scan SKILL.md files from project
    if (activeTask.skills && activeTask.skills.length > 0 && deps.projectDir) {
      const skillBlocks = []
      for (const skillName of activeTask.skills) {
        const skillDir = join(deps.projectDir, 'skills', skillName)
        const skillFile = join(skillDir, 'SKILL.md')
        if (existsSync(skillFile)) {
          const content = readFileSync(skillFile, 'utf-8')
          skillBlocks.push(`<skill name="${skillName}">\n${content}\n</skill>`)
        }
      }
      if (skillBlocks.length > 0) {
        fullPrompt = '## Active Skills\n' + skillBlocks.join('\n\n') + '\n---\n\n' + fullPrompt
      }
    }

    // Load contextFrom (latest output from sibling tasks)
    if (activeTask.contextFrom && activeTask.contextFrom.length > 0) {
      const contextBlocks = []
      for (const srcId of activeTask.contextFrom) {
        const srcDir = join(_outputDir, srcId)
        if (existsSync(srcDir)) {
          const files = readdirSync(srcDir).sort()
          if (files.length > 0) {
            const latest = files[files.length - 1]
            const content = readFileSync(join(srcDir, latest), 'utf-8').slice(0, 4000)
            contextBlocks.push(`## Output from task ${srcId}\n${content}`)
          }
        }
      }
      if (contextBlocks.length > 0) {
        fullPrompt = contextBlocks.join('\n\n') + '\n---\n\n' + fullPrompt
      }
    }

    // Add cron execution hint
    const now = new Date().toISOString()
    fullPrompt = `[Current time: ${now}]\n\n${fullPrompt}`

    // Create session and run
    const sessionId = `cron_${task.id}_${Date.now()}`
    // Reuse the pi-server's Agent if this is a scheduled task
    const options = {
      systemPrompt: undefined,
      providerID: activeTask.provider || deps.defaultProvider,
      modelID: activeTask.model || deps.defaultModel,
      thinkingLevel: 'off',
      apiKey: activeTask.apiKey || apiKey,
      workspaceDir: activeTask.workspaceDir || deps.projectDir,
    }
    if (deps.makeSession) {
      // If running inside pi-server, create a session
      options.sessionId = sessionId
    }

    const result = await deps.prompt(fullPrompt, options)
    if (result.error) {
      error = result.error
      output = `Error: ${result.error}`
    } else {
      output = result.text || '(no output)'
    }
  } catch (err) {
    error = err.message || String(err)
    output = `Error: ${error}`
  }

  try {
    // Save output to disk
    const doc = `# Task: ${task.name}\n` +
      `**Run:** ${new Date(startTime).toISOString()}\n` +
      `**Duration:** ${((Date.now() - startTime) / 1000).toFixed(1)}s\n` +
      `**Status:** ${error ? 'failed' : 'success'}\n\n` +
      `## Output\n\n${output}\n`

    saveTaskOutput(task.id, doc)

    // Mark run
    markTaskRun(task.id, error ? 'failed' : 'completed', output, error, {
      runId,
      trigger: deps.trigger || 'scheduled',
    })

    return { success: !error, output, error }
  } finally {
    if (_activeRuns.get(task.id) === runId) {
      _activeRuns.delete(task.id)
    }
  }
}

// ─── Ticker ──────────────────────────────────────────────

let _ticker = null

/**
 * Start the scheduler ticker. Runs due tasks every TICK_INTERVAL.
 * Returns the interval handle.
 */
export function startTicker(deps) {
  if (_ticker) return _ticker

  const tick = async () => {
    try {
      const capacity = Math.max(0, MAX_CONCURRENT_RUNS - _activeRuns.size)
      if (capacity === 0) return

      const due = getDueTasks().slice(0, capacity)
      for (const task of due) {
        // Fire-and-forget each due task
        runTask(task, { ...deps, trigger: 'scheduled' }).catch(err => {
          console.error('[task-scheduler] run failed:', task.id, err?.message)
        })
      }
    } catch (err) {
      console.error('[task-scheduler] tick error:', err?.message)
    }
  }

  _ticker = setInterval(tick, TICK_INTERVAL)
  // Also run immediately on start
  tick()
  console.log('[task-scheduler] started (interval=' + (TICK_INTERVAL / 1000) + 's)')
  return _ticker
}

export function stopTicker() {
  if (_ticker) {
    clearInterval(_ticker)
    _ticker = null
  }
}

export function init(baseDir) {
  _initPaths(baseDir)
}

// Re-export for pi-server
const cronJobs = {
  init, loadTasks, getTask, createTask, updateTask, removeTask,
  getDueTasks, markTaskRunning, markTaskRun, saveTaskOutput, getTaskOutputs,
  runTask, startTicker, stopTicker,
}

export default cronJobs
