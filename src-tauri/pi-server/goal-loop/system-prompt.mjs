/**
 * Goal Loop system prompt builder.
 * Enforced Plan → Execute → Check protocol for durable goal runs.
 */
import { discoverAgents, formatAgentList } from '../subagent/agent-registry.mjs'
import { assembleRuntimeSystemPrompt } from '../runtime-prompt.mjs'

export function buildGoalSystemPrompt(goalState, projectDir, runtimeConfig = {}) {
  const { agents } = discoverAgents(projectDir)
  const agentList = formatAgentList(agents)

  const goalPrompt = `## Goal Runtime
Operate autonomously within the active agent's identity, rules, permissions, and workspace authority. You must use the structured protocol below; a text-only completion without the required tool state is a failed run.

## Goal
${goalState.goal}

## Sub-Agents
${agentList}

## Required Protocol
1. Use read-only context tools when necessary to understand the task.
2. Your first state-changing action must be **plan_goal** with an ordered plan.
3. Call **execute_step(0)**, wait for completion, then call **check_progress(0)**.
4. Continue strictly in order: execute_step(N), then check_progress(N).
5. Do not execute another step until the previous step has been checked.
6. Execute and check every planned step before writing the final answer.
7. You may call execute_step at most ${goalState.maxIterations} times.
8. The final answer must distinguish completed work, failed work, evidence, and anything remaining.

## Planning Rules
- Each plan step must select one available sub-agent and contain a complete standalone task.
- Keep the plan proportional to the goal and within the iteration budget.
- Use researcher for investigation, coder for implementation, and reviewer for independent verification.
- A failed step still requires check_progress and must be reported honestly.
- Never claim success merely because the model stopped or a tool returned partial output.`

  return assembleRuntimeSystemPrompt({
    agentSystemPrompt: runtimeConfig.agentSystemPrompt,
    agentSkillsBlock: runtimeConfig.agentSkillsBlock,
    surfacePrompt: goalPrompt,
    fallbackPrompt: 'You are an autonomous goal executor. Follow safety, permission, and tool rules.',
  })
}
