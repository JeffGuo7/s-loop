export type GoalStatus = 'pending' | 'planning' | 'executing' | 'completed' | 'failed' | 'aborted'
export type StepStatus = 'pending' | 'running' | 'completed' | 'skipped' | 'failed'

export interface GoalStep {
  index: number
  name: string
  description: string
  agent: string
  task: string
  status: StepStatus
  result?: {
    agent: string
    exitCode: number
    finalOutput: string
    usage: { input: number; output: number; cost: number; turns: number }
    stopReason?: string
    errorMessage?: string
  }
}

export interface GoalPlan {
  steps: GoalStep[]
  reasoning: string
}

export interface GoalState {
  id: string
  goal: string
  status: GoalStatus
  plan: GoalPlan | null
  currentStepIndex: number
  currentIteration: number
  maxIterations: number
  progressNotes: string[]
  finalResult: string | null
  createdAt: number
  updatedAt: number
}

export type GoalSSEEvent =
  | { type: 'goal_planning' }
  | { type: 'goal_plan'; plan: GoalPlan }
  | { type: 'goal_step_start'; stepIndex: number }
  | { type: 'goal_step_update'; stepIndex: number; update: unknown }
  | { type: 'goal_step_end'; stepIndex: number; result: unknown }
  | { type: 'goal_checking' }
  | { type: 'goal_progress'; note: string }
  | { type: 'goal_done'; goalState: GoalState }
  | { type: 'goal_error'; message: string }
