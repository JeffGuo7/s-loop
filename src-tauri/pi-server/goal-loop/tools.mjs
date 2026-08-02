import { runSubagent } from '../subagent/index.mjs'

export function createPlanGoalTool(goalState) {
  return {
    name: 'plan_goal',
    label: 'Plan Goal',
    description: 'Create the required ordered execution plan. This must be the first state-changing goal action.',
    parameters: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              agent: { type: 'string' },
              task: { type: 'string' },
            },
            required: ['name', 'description', 'agent', 'task'],
          },
        },
        reasoning: { type: 'string' },
      },
      required: ['steps', 'reasoning'],
    },
    execute: async (_id, params) => {
      if (goalState.plan) {
        return {
          content: [{ type: 'text', text: 'A goal plan already exists and cannot be replaced during this run.' }],
          isError: true,
        }
      }
      const requested = Array.isArray(params.steps) ? params.steps : []
      if (requested.length === 0 || requested.length > goalState.maxIterations) {
        return {
          content: [{
            type: 'text',
            text: `Plan must contain between 1 and ${goalState.maxIterations} steps.`,
          }],
          isError: true,
        }
      }
      const steps = requested.map((step, index) => ({
        index,
        name: String(step.name || '').trim(),
        description: String(step.description || '').trim(),
        agent: String(step.agent || '').trim(),
        task: String(step.task || '').trim(),
        status: 'pending',
        checked: false,
      }))
      if (steps.some((step) => !step.name || !step.agent || !step.task)) {
        return {
          content: [{ type: 'text', text: 'Every plan step requires a name, agent, and task.' }],
          isError: true,
        }
      }
      goalState.plan = { steps, reasoning: String(params.reasoning || '').trim() }
      goalState.currentStepIndex = -1
      goalState.currentIteration = 0
      goalState.progressNotes = []
      return {
        content: [{ type: 'text', text: `Plan saved with ${steps.length} ordered steps. Execute step 0 next.` }],
        details: { plan: goalState.plan },
      }
    },
  }
}

export function createExecuteStepTool(goalState, opts) {
  return {
    name: 'execute_step',
    label: 'Execute Goal Step',
    description: 'Execute the next pending plan step through its assigned sub-agent. Steps must run in order and be checked before continuing.',
    parameters: {
      type: 'object',
      properties: {
        step_index: { type: 'number' },
      },
      required: ['step_index'],
    },
    execute: async (_id, params, signal, onUpdate) => {
      const index = Number(params.step_index)
      const planStep = goalState.plan?.steps?.[index]
      if (!planStep) {
        return { content: [{ type: 'text', text: `Plan step ${index} does not exist.` }], isError: true }
      }
      if (goalState.currentIteration >= goalState.maxIterations) {
        return { content: [{ type: 'text', text: 'Goal iteration budget exhausted.' }], isError: true }
      }
      const nextPending = goalState.plan.steps.find((step) => step.status === 'pending')
      if (!nextPending || nextPending.index !== index) {
        return { content: [{ type: 'text', text: `Step ${index} is not the next pending step.` }], isError: true }
      }
      const unchecked = goalState.plan.steps.find((step) => step.status !== 'pending' && !step.checked)
      if (unchecked) {
        return { content: [{ type: 'text', text: `Check step ${unchecked.index} before executing another step.` }], isError: true }
      }

      planStep.status = 'running'
      goalState.currentStepIndex = index
      goalState.currentIteration += 1
      const executionIndex = goalState.steps.length
      goalState.steps.push({
        agent: planStep.agent,
        task: planStep.task,
        status: 'running',
        planIndex: index,
        name: planStep.name,
      })

      const runSubagentFn = opts.runSubagent || runSubagent
      const result = await runSubagentFn({
        agentName: planStep.agent,
        task: planStep.task,
        parentConfig: opts.runtimeConfig,
        resolveModel: opts.resolveModel,
        getTools: opts.getTools,
        signal,
        onUpdate: (event) => onUpdate?.({ ...event, goalStepIndex: executionIndex }),
        projectDir: opts.projectDir,
        requestToolApproval: opts.requestToolApproval,
        onToolCallFinished: opts.onToolCallFinished,
        auditContext: opts.auditContext,
      })

      const stepResult = {
        exitCode: result.exitCode,
        finalOutput: result.finalOutput,
        usage: result.usage,
        errorMessage: result.errorMessage,
      }
      planStep.status = result.exitCode === 0 ? 'completed' : 'failed'
      planStep.result = stepResult
      goalState.steps[executionIndex] = {
        ...goalState.steps[executionIndex],
        status: planStep.status,
        result: stepResult,
      }

      return {
        content: [{ type: 'text', text: result.finalOutput || result.errorMessage || `Step ${index} finished.` }],
        details: { stepIndex: executionIndex, planIndex: index, result: stepResult },
        isError: result.exitCode !== 0,
      }
    },
  }
}

export function createCheckProgressTool(goalState) {
  return {
    name: 'check_progress',
    label: 'Check Goal Progress',
    description: 'Record the required assessment for the most recently executed plan step before continuing.',
    parameters: {
      type: 'object',
      properties: {
        step_index: { type: 'number' },
        achieved: { type: 'boolean' },
        note: { type: 'string' },
        adjustments: { type: 'array', items: { type: 'string' } },
      },
      required: ['step_index', 'achieved', 'note'],
    },
    execute: async (_id, params) => {
      const index = Number(params.step_index)
      const step = goalState.plan?.steps?.[index]
      if (!step || step.status === 'pending' || step.status === 'running') {
        return { content: [{ type: 'text', text: `Step ${index} has not finished.` }], isError: true }
      }
      if (index !== goalState.currentStepIndex) {
        return { content: [{ type: 'text', text: `Step ${index} is not the most recently executed step.` }], isError: true }
      }
      if (step.checked) {
        return { content: [{ type: 'text', text: `Step ${index} has already been checked.` }], isError: true }
      }

      step.checked = true
      step.achieved = params.achieved === true
      step.checkNote = String(params.note || '').trim()
      const status = step.achieved ? 'OK' : 'NEEDS WORK'
      goalState.progressNotes.push(`[step ${index}] ${status}: ${step.checkNote}`)
      for (const adjustment of Array.isArray(params.adjustments) ? params.adjustments : []) {
        goalState.progressNotes.push(`Adjustment: ${adjustment}`)
      }
      const remaining = goalState.plan.steps.filter((candidate) => candidate.status === 'pending').length
      return {
        content: [{ type: 'text', text: `Step ${index} checked. ${remaining} planned step(s) remain.` }],
        details: { achieved: step.achieved, remaining },
      }
    },
  }
}
