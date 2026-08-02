import { describe, expect, it } from 'vitest'
import { applyGoalSseEvent } from '../src/stores/goalStore'
import type { GoalState } from '../src/types/goal'

function goalFixture(): GoalState {
  return {
    id: 'goal-1',
    goal: 'Ship a feature',
    status: 'running',
    steps: [],
    plan: null,
    currentStepIndex: -1,
    currentIteration: 0,
    maxIterations: 5,
    progressNotes: [],
    finalResult: null,
    createdAt: 1,
    updatedAt: 1,
  }
}

describe('goal SSE state projection', () => {
  it('projects plan, execution, result, and verification into one live state', () => {
    let goal = applyGoalSseEvent(goalFixture(), {
      type: 'goal_plan',
      plan: {
        reasoning: 'Implement then verify',
        steps: [{
          index: 0,
          name: 'Implement',
          description: 'Write the feature',
          agent: 'coder',
          task: 'Implement it',
          status: 'pending',
          checked: false,
        }],
      },
    })
    goal = applyGoalSseEvent(goal, {
      type: 'goal_step_start',
      stepIndex: 0,
      planIndex: 0,
      agent: 'coder',
      task: 'Implement it',
    })
    expect(goal.plan?.steps[0].status).toBe('running')
    expect(goal.currentStepIndex).toBe(0)
    expect(goal.steps[0].status).toBe('running')

    const result = {
      exitCode: 0,
      finalOutput: 'done',
      usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 1 },
    }
    goal = applyGoalSseEvent(goal, {
      type: 'goal_step_end',
      stepIndex: 0,
      planIndex: 0,
      result,
    })
    expect(goal.plan?.steps[0].status).toBe('completed')

    goal = applyGoalSseEvent(goal, {
      type: 'goal_progress',
      planIndex: 0,
      note: '[step 0] OK: verified',
      progressNotes: ['[step 0] OK: verified'],
      planStep: {
        ...goal.plan!.steps[0],
        checked: true,
        achieved: true,
        checkNote: 'verified',
      },
    })
    expect(goal.plan?.steps[0]).toMatchObject({ checked: true, achieved: true, checkNote: 'verified' })
    expect(goal.progressNotes).toEqual(['[step 0] OK: verified'])
  })

  it('does not append duplicate execution rows when a start event is replayed', () => {
    const start = {
      type: 'goal_step_start' as const,
      stepIndex: 0,
      planIndex: 0,
      agent: 'coder',
      task: 'work',
    }
    const once = applyGoalSseEvent(goalFixture(), start)
    const replayed = applyGoalSseEvent(once, start)
    expect(replayed.steps).toHaveLength(1)
  })
})
