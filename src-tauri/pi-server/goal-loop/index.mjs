/**
 * Goal Loop Engine — creates a Goal Loop Agent that orchestrates
 * sub-agents to achieve a user's goal.
 *
 * Pattern: same as subagent/index.mjs — independent Agent instance,
 * goal-oriented system prompt, specialized tools.
 */
import { Agent } from '@earendil-works/pi-agent-core'
import { buildGoalSystemPrompt } from './system-prompt.mjs'
import { createPlanGoalTool, createExecuteStepTool, createCheckProgressTool } from './tools.mjs'
import { updateGoal } from './persistence.mjs'

const MAX_GOAL_TIMEOUT = 300_000  // 5 minutes for full goal loop

/**
 * Run the Goal Loop for a given goal state.
 *
 * @param {Object} opts
 * @param {Object} opts.goalState - The goal state object (mutated in-place)
 * @param {Object} opts.runtimeConfig - { providerID, modelID, apiKey, workspaceDir, providerConfig, webSearchConfig }
 * @param {Function} opts.resolveModel - (providerID, modelID, providerConfig) => model
 * @param {Function} opts.getTools - (workspaceDir, webSearchConfig) => tool[]
 * @param {string} opts.projectDir - Project directory
 * @param {AbortSignal} [opts.signal] - Abort signal
 * @param {Function} [opts.onUpdate] - Event callback for SSE forwarding
 * @param {Function} [opts.persistFn] - Called after each state mutation to persist
 * @returns {Promise<Object>} { exitCode, goalState, finalOutput, usage }
 */
export async function runGoalLoop({
  goalState,
  runtimeConfig,
  resolveModel,
  getTools,
  projectDir,
  signal,
  onUpdate,
  persistFn,
}) {
  // 1. Resolve model
  const providerID = runtimeConfig.providerID || 'anthropic'
  const modelID = runtimeConfig.modelID || 'claude-sonnet-4-6'
  const providerConfig = runtimeConfig.providerConfig || {}

  let model
  if (resolveModel) {
    model = resolveModel(providerID, modelID, providerConfig)
  }
  if (!model) {
    model = {
      id: modelID,
      name: modelID,
      api: providerConfig.api || 'openai-completions',
      provider: providerID,
      baseUrl: providerConfig.baseUrl || '',
      reasoning: false,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      contextLength: 128000,
      maxTokens: 4096,
    }
  }

  // 2. Build tools: just the 3 goal tools (no coding tools — the LLM only orchestrates)
  // Read-only context tools so the Goal Loop Agent can orient itself
  const allTools = getTools
    ? getTools(runtimeConfig.workspaceDir, runtimeConfig.webSearchConfig)
    : []
  const contextToolNames = new Set(['read', 'grep', 'find', 'ls', 'web_search', 'web_fetch'])
  const contextTools = allTools.filter((t) => contextToolNames.has(t.name))

  const planGoalTool = createPlanGoalTool(goalState)
  const executeStepTool = createExecuteStepTool(goalState, { runtimeConfig, resolveModel, getTools, projectDir })
  const checkProgressTool = createCheckProgressTool(goalState)

  const tools = [...contextTools, planGoalTool, executeStepTool, checkProgressTool]

  // 3. Build system prompt
  const systemPrompt = buildGoalSystemPrompt(goalState, projectDir)

  // 4. Create independent Agent instance
  const sessionId = `goal-${goalState.id}-${Date.now()}`
  const apiKey = runtimeConfig.apiKey || ''

  goalState.status = 'planning'

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model,
      tools,
      thinkingLevel: model.reasoning ? 'medium' : 'off',
    },
    sessionId,
    getApiKey: async () => apiKey,
    toolExecution: 'sequential',
  })

  // 5. Subscribe to events → forward structured goal events
  const unsub = agent.subscribe((event) => {
    if (!onUpdate) return
    switch (event.type) {
      case 'tool_execution_start': {
        if (event.toolName === 'plan_goal') {
          onUpdate({ type: 'goal_planning' })
        } else if (event.toolName === 'execute_step') {
          const stepIdx = event.args?.step_index
          if (stepIdx !== undefined && goalState.plan) {
            onUpdate({ type: 'goal_step_start', stepIndex: stepIdx })
          }
        } else if (event.toolName === 'check_progress') {
          onUpdate({ type: 'goal_checking' })
        }
        break
      }
      case 'tool_execution_end': {
        if (event.toolName === 'plan_goal') {
          onUpdate({ type: 'goal_plan', plan: goalState.plan })
          if (persistFn) persistFn(goalState)
        } else if (event.toolName === 'execute_step') {
          const stepIdx = goalState.currentStepIndex
          if (stepIdx >= 0 && goalState.plan) {
            const step = goalState.plan.steps[stepIdx]
            onUpdate({ type: 'goal_step_end', stepIndex: stepIdx, result: step?.result || event.result })
          }
          if (persistFn) persistFn(goalState)
        } else if (event.toolName === 'check_progress') {
          onUpdate({ type: 'goal_progress', note: goalState.progressNotes[goalState.progressNotes.length - 1] || '' })
          if (persistFn) persistFn(goalState)
        }
        break
      }
      case 'tool_execution_update': {
        onUpdate({ type: 'goal_step_update', stepIndex: goalState.currentStepIndex, update: event.partialResult })
        break
      }
    }
  })

  // 6. Build initial prompt — directive, not suggestive
  const initialPrompt = `Goal: ${goalState.goal}

IMPORTANT: You MUST call plan_goal NOW. Do NOT write a text response. Use the plan_goal tool immediately with your plan for achieving this goal.`

  let finalOutput = ''
  let usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 }

  try {
    const timeoutId = setTimeout(() => {
      agent.abort()
    }, MAX_GOAL_TIMEOUT)

    const abortHandler = () => agent.abort()
    signal?.addEventListener('abort', abortHandler, { once: true })

    try {
      await agent.prompt(initialPrompt)

      // If the model responded with text instead of calling plan_goal, retry
      let retries = 0
      while (!goalState.plan && retries < 2) {
        retries++
        console.log(`[goal-loop] plan_goal not called after prompt ${retries}, retrying with stronger directive...`)
        await agent.prompt(
          `You have NOT called plan_goal yet. This is your attempt #${retries + 1}. ` +
          `You MUST call the plan_goal tool RIGHT NOW with your structured plan. ` +
          `Do NOT write any text — call the tool.`
        )
      }

      if (!goalState.plan) {
        console.log('[goal-loop] plan_goal was never called — model refused to invoke the tool')
        goalState.status = 'failed'
        goalState.finalResult = 'Agent completed without calling plan_goal. The model may not support tool calling for this workflow.'
        if (persistFn) persistFn(goalState)
        if (onUpdate) {
          onUpdate({ type: 'goal_error', message: goalState.finalResult })
        }
        return { exitCode: 1, goalState, finalOutput: goalState.finalResult, usage }
      }

      // Read messages from agent.state, same pattern as subagent/index.mjs
      const messages = agent.state.messages || []

      if (Array.isArray(messages) && messages.length > 0) {
        // Extract final output from the last assistant message
        const lastAssistant = [...messages].reverse().find(
          m => m.role === 'assistant' && m.content?.some(c => c.type === 'text')
        )
        if (lastAssistant) {
          const textParts = lastAssistant.content
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join('\n\n')
          if (textParts.trim()) {
            finalOutput = textParts
          }
        }

        // Aggregate usage from assistant messages only
        for (const msg of messages) {
          if (msg.role === 'assistant' && msg.usage) {
            usage.input += msg.usage.input || 0
            usage.output += msg.usage.output || 0
            usage.cacheRead += msg.usage.cacheRead || 0
            usage.cacheWrite += msg.usage.cacheWrite || 0
            usage.cost += msg.usage.cost || 0
            usage.turns += 1
          }
        }
      }

      // If model didn't write a summary, build result from step outputs
      if (!finalOutput && goalState.plan) {
        const completedSteps = goalState.plan.steps.filter(s => s.result?.finalOutput)
        if (completedSteps.length > 0) {
          finalOutput = completedSteps.map(s =>
            `## Step ${s.index + 1}: ${s.name}\n\n${s.result.finalOutput}`
          ).join('\n\n---\n\n')
        } else {
          const total = goalState.plan.steps.length
          const done = goalState.plan.steps.filter(s => s.status === 'completed' || s.status === 'failed').length
          finalOutput = `Goal completed. ${done}/${total} step(s) executed. Check the step details below for results.`
        }
      }

      goalState.finalResult = finalOutput
      goalState.status = 'completed'
      if (persistFn) persistFn(goalState)

      if (onUpdate) {
        onUpdate({ type: 'goal_done', goalState })
      }
    } finally {
      clearTimeout(timeoutId)
      signal?.removeEventListener('abort', abortHandler)
    }
  } catch (err) {
    if (signal?.aborted || err?.name === 'AbortError') {
      goalState.status = 'aborted'
    } else {
      goalState.status = 'failed'
      goalState.finalResult = err instanceof Error ? err.message : String(err)
    }
    if (persistFn) persistFn(goalState)

    if (onUpdate) {
      onUpdate({ type: 'goal_error', message: goalState.finalResult || 'Unknown error' })
    }
  } finally {
    unsub()
  }

  return {
    exitCode: goalState.status === 'completed' ? 0 : 1,
    goalState,
    finalOutput,
    usage,
  }
}
