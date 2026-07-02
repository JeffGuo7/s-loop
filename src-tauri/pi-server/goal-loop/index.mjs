/**
 * Goal Loop Engine — simple agent loop for achieving goals.
 *
 * Pattern: one Agent with access to sub-agents as tools.
 * No enforced plan/execute/check protocol — the AI decides how to work.
 */
import { Agent } from '@earendil-works/pi-agent-core'
import { buildGoalSystemPrompt } from './system-prompt.mjs'
import { createRunSubagentTool } from './tools.mjs'

const MAX_GOAL_TIMEOUT = 300_000  // 5 minutes

/**
 * @param {Object} opts
 * @param {Object} opts.goalState - { id, goal, steps[], status, finalResult }
 * @param {Object} opts.runtimeConfig - { providerID, modelID, apiKey, workspaceDir, providerConfig, webSearchConfig }
 * @param {Function} opts.resolveModel - (providerID, modelID, providerConfig) => model
 * @param {Function} opts.getTools - (workspaceDir, webSearchConfig) => tool[]
 * @param {string} opts.projectDir
 * @param {AbortSignal} [opts.signal]
 * @param {Function} [opts.onUpdate] - event callback for SSE
 * @param {Function} [opts.persistFn] - called to persist goal state
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
      id: modelID, name: modelID,
      api: providerConfig.api || 'openai-completions',
      provider: providerID,
      baseUrl: providerConfig.baseUrl || '',
      reasoning: false, input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000, contextLength: 128000, maxTokens: 4096,
    }
  }

  // 2. Build tools — context tools + run_subagent
  const allTools = getTools
    ? getTools(runtimeConfig.workspaceDir, runtimeConfig.webSearchConfig)
    : []
  const contextToolNames = new Set(['read', 'grep', 'find', 'ls', 'web_search', 'web_fetch'])
  const contextTools = allTools.filter((t) => contextToolNames.has(t.name))
  const runSubagentTool = createRunSubagentTool(goalState, {
    runtimeConfig, resolveModel, getTools, projectDir,
  })
  const tools = [...contextTools, runSubagentTool]

  // 3. Build system prompt
  const systemPrompt = buildGoalSystemPrompt(goalState, projectDir)

  // 4. Create Agent
  const sessionId = `goal-${goalState.id}-${Date.now()}`
  const apiKey = runtimeConfig.apiKey || ''

  goalState.status = 'running'

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

  // 5. Subscribe to events → forward tool events for UI progress
  const unsub = agent.subscribe((event) => {
    if (!onUpdate) return
    // Forward subagent tool events for step tracking in the UI
    if (event.type === 'tool_execution_end' && event.toolName === 'run_subagent') {
      // Step events are already emitted by the tool's execute function
    }
    if (persistFn) persistFn(goalState)
  })

  // 6. Execute
  const initialPrompt = `Goal: ${goalState.goal}\n\nWork towards this goal. Research first, then delegate to sub-agents as needed. When done, summarize what was accomplished.`

  let finalOutput = ''
  let usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 }

  try {
    const timeoutId = setTimeout(() => agent.abort(), MAX_GOAL_TIMEOUT)
    const abortHandler = () => agent.abort()
    signal?.addEventListener('abort', abortHandler, { once: true })

    try {
      await agent.prompt(initialPrompt)

      // Collect results from messages
      const messages = agent.state.messages || []
      if (Array.isArray(messages) && messages.length > 0) {
        const lastAssistant = [...messages].reverse().find(
          m => m.role === 'assistant' && m.content?.some(c => c.type === 'text')
        )
        if (lastAssistant) {
          finalOutput = lastAssistant.content
            .filter(c => c.type === 'text')
            .map(c => c.text)
            .join('\n\n')
        }

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

      // Fallback: build summary from step outputs
      if (!finalOutput) {
        const completedSteps = goalState.steps.filter(s => s.result?.finalOutput)
        finalOutput = completedSteps.length > 0
          ? completedSteps.map((s, i) => `## ${s.agent}: ${s.task.slice(0, 60)}\n\n${s.result.finalOutput}`).join('\n\n---\n\n')
          : `Goal completed. ${goalState.steps.length} step(s) executed.`
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
      goalState.finalResult = 'Goal was aborted.'
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
