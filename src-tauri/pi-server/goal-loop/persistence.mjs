/**
 * Goal Loop persistence — JSON file storage for goal states.
 * Same pattern as task-scheduler.mjs.
 *
 * Goals: {DATA_DIR}/goals/goals.json
 * Output: {DATA_DIR}/goals/output/{goalId}/
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

let _goalsFile = ''
let _outputDir = ''

export function initGoalPersistence(baseDir) {
  const goalsDir = join(baseDir, 'goals')
  _outputDir = join(goalsDir, 'output')
  _goalsFile = join(goalsDir, 'goals.json')
  mkdirSync(goalsDir, { recursive: true })
  mkdirSync(_outputDir, { recursive: true })
}

function _loadRaw() {
  if (!existsSync(_goalsFile)) return []
  try {
    const data = JSON.parse(readFileSync(_goalsFile, 'utf-8'))
    return Array.isArray(data) ? data : (data.goals || [])
  } catch { return [] }
}

function _save(goals) {
  writeFileSync(_goalsFile, JSON.stringify({ goals, updatedAt: new Date().toISOString() }, null, 2))
}

export function loadGoals() {
  return _loadRaw()
}

export function getGoal(id) {
  return _loadRaw().find(g => g.id === id) || null
}

export function createGoal(data) {
  const goals = _loadRaw()
  const now = Date.now()
  const goal = {
    id: randomUUID(),
    goal: data.goal || '',
    status: 'pending',
    plan: null,
    currentStepIndex: -1,
    currentIteration: 0,
    maxIterations: data.maxIterations || 5,
    progressNotes: [],
    finalResult: null,
    createdAt: now,
    updatedAt: now,
  }
  goals.push(goal)
  _save(goals)
  return goal
}

export function updateGoal(id, updates) {
  const goals = _loadRaw()
  const idx = goals.findIndex(g => g.id === id)
  if (idx === -1) return null
  goals[idx] = { ...goals[idx], ...updates, updatedAt: Date.now() }
  _save(goals)
  return goals[idx]
}

export function deleteGoal(id) {
  const goals = _loadRaw()
  const filtered = goals.filter(g => g.id !== id)
  if (filtered.length === goals.length) return false
  _save(filtered)
  return true
}

export function saveGoalRunOutput(goalId, content) {
  if (!_outputDir) return
  const dir = join(_outputDir, goalId)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${Date.now()}.md`)
  writeFileSync(file, content, 'utf-8')
  return file
}
