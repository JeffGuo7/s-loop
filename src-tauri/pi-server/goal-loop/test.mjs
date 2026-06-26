/**
 * Goal Loop tests — persistence, tools, and integration tests.
 * Run: node --test src-tauri/pi-server/goal-loop/test.mjs
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const TEST_DIR = join(__dirname, '..', '..', '.test-goal-data')

// ── Setup / Teardown ────────────────────────────────────────

function makeGoalState(overrides = {}) {
  return {
    id: 'test-goal-1',
    goal: 'Test goal: write a hello world program',
    status: 'pending',
    plan: null,
    currentStepIndex: -1,
    currentIteration: 0,
    maxIterations: 5,
    progressNotes: [],
    finalResult: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

before(() => {
  try { rmSync(TEST_DIR, { recursive: true }) } catch {}
  mkdirSync(TEST_DIR, { recursive: true })
})

after(() => {
  try { rmSync(TEST_DIR, { recursive: true }) } catch {}
})

// ── Persistence tests ───────────────────────────────────────

describe('goal-loop persistence', () => {
  let persistence

  before(async () => {
    // Set DATA_DIR to test dir
    process.env.SNOTRA_PROJECT_DIR = TEST_DIR
    persistence = await import('./persistence.mjs')
    persistence.initGoalPersistence(TEST_DIR)
  })

  it('creates a goal', () => {
    const goal = persistence.createGoal({ goal: 'Write tests', maxIterations: 3 })
    assert.equal(goal.goal, 'Write tests')
    assert.equal(goal.status, 'pending')
    assert.equal(goal.maxIterations, 3)
    assert.ok(goal.id)
    assert.ok(goal.createdAt)
  })

  it('loads goals', () => {
    persistence.createGoal({ goal: 'Second goal' })
    const goals = persistence.loadGoals()
    assert.ok(goals.length >= 2)
  })

  it('gets a goal by id', () => {
    const created = persistence.createGoal({ goal: 'Find me' })
    const found = persistence.getGoal(created.id)
    assert.equal(found.goal, 'Find me')
  })

  it('updates a goal', () => {
    const created = persistence.createGoal({ goal: 'Update me' })
    const updated = persistence.updateGoal(created.id, { goal: 'Updated goal', status: 'executing' })
    assert.equal(updated.goal, 'Updated goal')
    assert.equal(updated.status, 'executing')
  })

  it('returns null for non-existent goal update', () => {
    const result = persistence.updateGoal('nonexistent', { goal: 'Nope' })
    assert.equal(result, null)
  })

  it('deletes a goal', () => {
    const created = persistence.createGoal({ goal: 'Delete me' })
    const ok = persistence.deleteGoal(created.id)
    assert.equal(ok, true)
    assert.equal(persistence.getGoal(created.id), null)
  })

  it('returns false for non-existent delete', () => {
    assert.equal(persistence.deleteGoal('nonexistent'), false)
  })

  it('goals.json file exists after creation', () => {
    const goalsFile = join(TEST_DIR, 'goals', 'goals.json')
    assert.ok(existsSync(goalsFile))
  })
})

// ── Tools tests (unit) ──────────────────────────────────────

describe('goal-loop tools', () => {
  let tools

  before(async () => {
    tools = await import('./tools.mjs')
  })

  describe('plan_goal tool', () => {
    it('saves a plan to goalState', async () => {
      const gs = makeGoalState()
      const tool = tools.createPlanGoalTool(gs)
      const result = await tool.execute('id-1', {
        steps: [
          { name: 'Step 1', description: 'First step', agent: 'coder', task: 'Write code' },
          { name: 'Step 2', description: 'Second step', agent: 'reviewer', task: 'Review code' },
        ],
        reasoning: 'We need two steps',
      })

      assert.equal(gs.status, 'executing')
      assert.equal(gs.plan.steps.length, 2)
      assert.equal(gs.plan.steps[0].name, 'Step 1')
      assert.equal(gs.plan.steps[0].status, 'pending')
      assert.equal(gs.plan.steps[0].agent, 'coder')
      assert.equal(gs.plan.steps[1].agent, 'reviewer')
      assert.equal(gs.plan.reasoning, 'We need two steps')
      assert.ok(Array.isArray(result.content))
    })
  })

  describe('check_progress tool', () => {
    it('records progress notes', async () => {
      const gs = makeGoalState()
      gs.plan = {
        steps: [
          { index: 0, name: 'S1', description: '', agent: 'coder', task: 'do', status: 'completed' },
        ],
        reasoning: 'test',
      }
      const tool = tools.createCheckProgressTool(gs)
      const result = await tool.execute('id-2', {
        step_index: 0,
        achieved: true,
        note: 'All good',
      })

      assert.equal(gs.progressNotes.length, 1)
      assert.ok(gs.progressNotes[0].includes('All good'))
      assert.ok(result.content[0].text.includes('achieved'))
    })

    it('records adjustments', async () => {
      const gs = makeGoalState()
      gs.plan = {
        steps: [
          { index: 0, name: 'S1', description: '', agent: 'coder', task: 'do', status: 'completed' },
          { index: 1, name: 'S2', description: '', agent: 'reviewer', task: 'review', status: 'pending' },
        ],
        reasoning: 'test',
      }
      const tool = tools.createCheckProgressTool(gs)
      await tool.execute('id-3', {
        step_index: 0,
        achieved: false,
        note: 'Missing edge case',
        adjustments: ['Add edge case handling to step 2'],
      })

      assert.equal(gs.progressNotes.length, 2) // note + adjustment
      assert.ok(gs.progressNotes[1].includes('edge case'))
    })
  })
})

// ── System prompt tests ─────────────────────────────────────

describe('goal-loop system prompt', () => {
  it('generates prompt with goal and agent list', async () => {
    const { buildGoalSystemPrompt } = await import('./system-prompt.mjs')
    const gs = makeGoalState()
    const prompt = buildGoalSystemPrompt(gs, TEST_DIR)

    assert.ok(prompt.includes('Test goal: write a hello world program'))
    assert.ok(prompt.includes('plan_goal'))
    assert.ok(prompt.includes('execute_step'))
    assert.ok(prompt.includes('check_progress'))
    assert.ok(prompt.includes('5')) // maxIterations
  })
})
