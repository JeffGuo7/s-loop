/**
 * Goal Loop system prompt builder.
 * Simple directive: achieve the goal using available tools and sub-agents.
 * No enforced protocol — the AI decides how to decompose and execute.
 */
import { discoverAgents, formatAgentList } from '../subagent/agent-registry.mjs'

export function buildGoalSystemPrompt(goalState, projectDir) {
  const { agents } = discoverAgents(projectDir)
  const agentList = formatAgentList(agents)

  return `You are an autonomous goal executor. Achieve the user's goal by researching, delegating, and building.

## Goal
${goalState.goal}

## Sub-Agents
${agentList}

Use **run_subagent** to delegate tasks. Choose the right sub-agent for each task:
- \`researcher\` — investigate code, search docs, analyze patterns
- \`coder\` — write and edit code
- \`reviewer\` — review for bugs, security, and quality

Use **web_search** and **web_fetch** to gather information. Use **read**, **grep**, and other tools to explore the codebase.

## Approach
1. Research first — understand the codebase and problem before acting
2. Delegate strategically — use sub-agents for focused work
3. Verify results — review what sub-agents produce
4. When the goal is achieved, write a clear final summary of what was done`
}
