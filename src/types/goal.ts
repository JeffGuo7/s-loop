export type GoalStatus =
  | 'pending'
  | 'running'
  | 'waiting_for_approval'
  | 'completed'
  | 'failed'
  | 'aborted'

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

export interface GoalPlanStep {
  index: number
  name: string
  description: string
  agent: string
  task: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  checked: boolean
  achieved?: boolean
  checkNote?: string
  result?: GoalStep['result']
}

export interface GoalPlan {
  steps: GoalPlanStep[]
  reasoning: string
}

export interface GoalState {
  id: string
  goal: string
  status: GoalStatus
  steps: GoalStep[]
  plan: GoalPlan | null
  currentStepIndex: number
  currentIteration: number
  maxIterations: number
  progressNotes: string[]
  finalResult: string | null
  pendingApprovalId?: string
  lastRunId?: string
  createdAt: number
  updatedAt: number
}

export type GoalSSEEvent =
  | { type: 'goal_planning' }
  | { type: 'goal_plan'; plan: GoalPlan | null }
  | { type: 'goal_step_start'; agent: string; task: string; stepIndex: number }
  | { type: 'goal_step_end'; stepIndex: number; result: GoalStep['result'] }
  | { type: 'goal_step_update'; stepIndex: number; update: unknown }
  | { type: 'goal_checking' }
  | { type: 'goal_progress'; note: string }
  | { type: 'goal_waiting_for_approval'; approvalId: string; toolName: string; goalState: GoalState }
  | { type: 'goal_resumed'; approvalId: string; goalState: GoalState }
  | { type: 'goal_done'; goalState: GoalState }
  | { type: 'goal_error'; message: string }
