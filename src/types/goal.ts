export type GoalStatus = 'pending' | 'running' | 'completed' | 'failed' | 'aborted'

export interface GoalStep {
  agent: string
  task: string
  status: 'running' | 'completed' | 'failed'
  result?: {
    exitCode: number
    finalOutput: string
    usage: { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number; turns: number }
    errorMessage?: string
  }
}

export interface GoalState {
  id: string
  goal: string
  status: GoalStatus
  steps: GoalStep[]
  finalResult: string | null
  createdAt: number
  updatedAt: number
}

export type GoalSSEEvent =
  | { type: 'goal_step_start'; agent: string; task: string; stepIndex: number }
  | { type: 'goal_step_end'; stepIndex: number; result: GoalStep['result'] }
  | { type: 'goal_done'; goalState: GoalState }
  | { type: 'goal_error'; message: string }
