/**
 * Goal Loop tools — single run_subagent tool.
 * The AI decides which sub-agent to call and what task to give it.
 * No enforced plan/execute/check protocol.
 */
import { runSubagent } from '../subagent/index.mjs'

/**
 * run_subagent — Delegate a task to a sub-agent.
 * The goal agent calls this whenever it needs specialized work done.
 */
export function createRunSubagentTool(goalState, opts) {
  return {
    name: 'run_subagent',
    label: 'Run Sub-Agent',
    description: 'Delegate a task to a specialized sub-agent. Use this for research, coding, or review work. The sub-agent runs independently and returns its results.',
    parameters: {
      type: 'object',
      properties: {
        agent: {
          type: 'string',
          description: 'Which sub-agent to use: researcher (investigate/search), coder (write/edit code), or reviewer (audit/review)',
        },
        task: {
          type: 'string',
          description: 'The task description for the sub-agent. Be specific about what you need.',
        },
      },
      required: ['agent', 'task'],
    },
    execute: async (_id, params, signal, onUpdate) => {
      const stepIndex = goalState.steps.length

      // Record step as running
      goalState.steps.push({
        agent: params.agent,
        task: params.task,
        status: 'running',
      })

      if (onUpdate) {
        onUpdate({
          type: 'goal_step_start',
          agent: params.agent,
          task: params.task,
          stepIndex,
        })
      }

      const result = await runSubagent({
        agentName: params.agent,
        task: params.task,
        parentConfig: opts.runtimeConfig,
        resolveModel: opts.resolveModel,
        getTools: opts.getTools,
        signal,
        onUpdate: (ev) => {
          if (onUpdate) {
            onUpdate({ ...ev, goalStepIndex: stepIndex })
          }
        },
        projectDir: opts.projectDir,
      })

      // Update step with result
      goalState.steps[stepIndex] = {
        ...goalState.steps[stepIndex],
        status: result.exitCode === 0 ? 'completed' : 'failed',
        result: {
          exitCode: result.exitCode,
          finalOutput: result.finalOutput,
          usage: result.usage,
          errorMessage: result.errorMessage,
        },
      }

      if (onUpdate) {
        onUpdate({
          type: 'goal_step_end',
          stepIndex,
          result: goalState.steps[stepIndex].result,
        })
      }

      return {
        content: [{
          type: 'text',
          text: result.finalOutput || `Sub-agent ${params.agent} completed with exit code ${result.exitCode}.`,
        }],
        details: { stepIndex, result: goalState.steps[stepIndex].result },
      }
    },
  }
}
