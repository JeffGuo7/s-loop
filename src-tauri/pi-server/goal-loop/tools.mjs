/**
 * Goal Loop tools — tool definitions for the Goal Loop Agent.
 *
 * These tools are PASSIVE: they don't call LLMs themselves.
 * The Goal Loop Agent (the LLM) does all the reasoning and
 * passes structured results via these tools.
 */
import { runSubagent } from '../subagent/index.mjs'

/**
 * plan_goal — Agent passes its decomposed plan to this tool.
 * Validates and saves to goalState.
 */
export function createPlanGoalTool(goalState) {
  return {
    name: 'plan_goal',
    label: 'Plan Goal',
    description: 'Save your decomposed plan. Call this FIRST with your structured plan of steps to achieve the goal.',
    parameters: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          description: 'Ordered list of steps to execute',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Short name for this step' },
              description: { type: 'string', description: 'What this step accomplishes' },
              agent: { type: 'string', description: 'Sub-agent to use: researcher, coder, or reviewer' },
              task: { type: 'string', description: 'Specific task prompt for the sub-agent' },
            },
            required: ['name', 'description', 'agent', 'task'],
          },
        },
        reasoning: { type: 'string', description: 'Your reasoning behind this plan' },
      },
      required: ['steps', 'reasoning'],
    },
    execute: async (_id, params) => {
      const steps = params.steps.map((s, i) => ({
        index: i,
        name: s.name,
        description: s.description,
        agent: s.agent,
        task: s.task,
        status: 'pending',
      }))
      goalState.plan = { steps, reasoning: params.reasoning }
      goalState.status = 'executing'
      return {
        content: [{ type: 'text', text: `Plan saved: ${steps.length} steps. Starting execution.` }],
        details: { plan: goalState.plan },
      }
    },
  }
}

/**
 * execute_step — Agent specifies which step to run.
 * Calls runSubagent() and records the result.
 */
export function createExecuteStepTool(goalState, opts) {
  return {
    name: 'execute_step',
    label: 'Execute Step',
    description: `Execute a planned step by delegating to a sub-agent. Current step index: ${goalState.currentStepIndex}. Call this for the NEXT pending step.`,
    parameters: {
      type: 'object',
      properties: {
        step_index: { type: 'number', description: 'Index of the step to execute (0-based)' },
      },
      required: ['step_index'],
    },
    execute: async (_id, params, signal, onUpdate) => {
      const idx = params.step_index

      // Enforce maxIterations server-side
      if (goalState.currentIteration >= goalState.maxIterations) {
        return {
          content: [{ type: 'text', text: `Maximum iterations (${goalState.maxIterations}) reached. Please call check_progress to finalize, or stop here.` }],
          details: { error: 'max iterations reached' },
          isError: true,
        }
      }

      if (!goalState.plan || !goalState.plan.steps[idx]) {
        return {
          content: [{ type: 'text', text: `Error: step ${idx} not found in plan.` }],
          details: { error: 'step not found' },
          isError: true,
        }
      }

      const step = goalState.plan.steps[idx]
      step.status = 'running'
      goalState.currentStepIndex = idx
      goalState.currentIteration++

      const result = await runSubagent({
        agentName: step.agent,
        task: step.task,
        parentConfig: opts.runtimeConfig,
        resolveModel: opts.resolveModel,
        getTools: opts.getTools,
        signal,
        onUpdate: (ev) => {
          if (onUpdate) {
            onUpdate({ ...ev, goalStepIndex: idx })
          }
        },
        projectDir: opts.projectDir,
      })

      step.result = result
      step.status = result.exitCode === 0 ? 'completed' : 'failed'

      return {
        content: [{ type: 'text', text: result.finalOutput || `Step ${idx} completed with exit code ${result.exitCode}` }],
        details: { stepIndex: idx, result },
      }
    },
  }
}

/**
 * check_progress — Agent passes its assessment of the completed step.
 * The LLM itself evaluates whether the goal is achieved.
 */
export function createCheckProgressTool(goalState) {
  return {
    name: 'check_progress',
    label: 'Check Progress',
    description: `Record your assessment of the most recently completed step. Current plan has ${goalState.plan?.steps.length || 0} steps.`,
    parameters: {
      type: 'object',
      properties: {
        step_index: { type: 'number', description: 'Index of the step just completed' },
        achieved: { type: 'boolean', description: 'Whether this step achieved its goal' },
        note: { type: 'string', description: 'Your assessment of the result' },
        adjustments: {
          type: 'array',
          description: 'If the goal is not yet achieved, describe adjustments needed for remaining steps (or null if none)',
          items: { type: 'string' },
        },
      },
      required: ['step_index', 'achieved', 'note'],
    },
    execute: async (_id, params) => {
      goalState.progressNotes.push(`[step ${params.step_index}] ${params.achieved ? 'OK' : 'NEEDS WORK'}: ${params.note}`)

      if (params.adjustments && params.adjustments.length > 0 && goalState.plan) {
        for (const adj of params.adjustments) {
          goalState.progressNotes.push(`  Adjustment: ${adj}`)
        }
      }

      const remaining = goalState.plan
        ? goalState.plan.steps.filter(s => s.status === 'pending').length
        : 0

      return {
        content: [{
          type: 'text',
          text: params.achieved
            ? `Step ${params.step_index} achieved. ${remaining} step(s) remaining.`
            : `Step ${params.step_index} needs follow-up. ${remaining} step(s) remaining.${params.adjustments ? ' Adjustments noted.' : ''}`,
        }],
        details: { achieved: params.achieved, remaining, adjustments: params.adjustments },
      }
    },
  }
}
