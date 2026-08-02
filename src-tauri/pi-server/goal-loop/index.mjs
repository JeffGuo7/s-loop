/**
 * Goal Loop Engine — stateful goal orchestration with an enforced
 * plan -> execute -> check protocol.
 */
import { Agent } from '@earendil-works/pi-agent-core'
import { buildGoalSystemPrompt } from './system-prompt.mjs'
import { createPlanGoalTool, createExecuteStepTool, createCheckProgressTool } from './tools.mjs'
import { evaluateToolCall } from '../execution-policy.mjs'
import { buildToolSecurityIndex } from '../tool-security.mjs'
import { createToolAuditTracker } from '../audit-store.mjs'
import { getConfiguredThinkingLevel, resolveThinkingLevel } from '../reasoning-capabilities.mjs'

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
 * @param {Function} [opts.requestToolApproval] - durable approval callback
 * @param {Function} [opts.onToolCallFinished] - approval completion callback
 * @param {Object} [opts.auditContext] - surface/run correlation metadata
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
  requestToolApproval,
  onToolCallFinished,
  auditContext,
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

  // 2. Build tools — read-only context plus the enforced goal state machine
  const allTools = getTools
    ? getTools(runtimeConfig.workspaceDir, runtimeConfig.webSearchConfig)
    : []
  const contextToolNames = new Set(['read', 'grep', 'find', 'ls', 'web_search', 'web_fetch'])
  const contextTools = allTools.filter((t) => contextToolNames.has(t.name))
  const delegationRuntimeConfig = {
    ...runtimeConfig,
    agentId: 'goal-loop',
    delegationDepth: 0,
    allowedToolNames: allTools.map((tool) => tool.name),
    toolSecurity: buildToolSecurityIndex(allTools),
  }
  const planGoalTool = createPlanGoalTool(goalState)
  const executeStepTool = createExecuteStepTool(goalState, {
    runtimeConfig: delegationRuntimeConfig, resolveModel, getTools, projectDir,
    requestToolApproval: requestToolApproval
      ? (toolCall, decision) => authorize(toolCall, decision)
      : undefined,
    onToolCallFinished,
    auditContext,
  })
  const checkProgressTool = createCheckProgressTool(goalState)
  const tools = [...contextTools, planGoalTool, executeStepTool, checkProgressTool]
  const effectiveConfig = {
    ...runtimeConfig,
    toolSecurity: buildToolSecurityIndex(tools),
  }
  const toolAudit = createToolAuditTracker(auditContext || {
    surface: 'goal',
    surfaceId: goalState.id,
  })

  // 3. Build system prompt
  const systemPrompt = buildGoalSystemPrompt(goalState, projectDir, runtimeConfig)

  // 4. Create Agent
  const sessionId = `goal-${goalState.id}-${Date.now()}`
  const apiKey = runtimeConfig.apiKey || ''

  goalState.status = 'running'
  let executionTimeout
  let blockedApprovalReason = ''

  const pauseExecutionTimeout = () => {
    if (executionTimeout) clearTimeout(executionTimeout)
    executionTimeout = undefined
  }
  const armExecutionTimeout = () => {
    pauseExecutionTimeout()
    executionTimeout = setTimeout(() => agent.abort(), MAX_GOAL_TIMEOUT)
  }
  const authorize = async (toolCall, decision) => {
    pauseExecutionTimeout()
    try {
      const result = await requestToolApproval(toolCall, decision)
      if (result?.approvalDenied) blockedApprovalReason = result.reason
      return result
    } finally {
      if (!signal?.aborted && !blockedApprovalReason) armExecutionTimeout()
    }
  }

  const agent = new Agent({
    initialState: {
      systemPrompt,
      model,
      tools,
      thinkingLevel: resolveThinkingLevel(model, getConfiguredThinkingLevel(runtimeConfig, modelID)),
    },
    sessionId,
    getApiKey: async () => apiKey,
    beforeToolCall: async ({ toolCall }) => {
      const decision = evaluateToolCall(toolCall, effectiveConfig)
      toolAudit.decision(toolCall, decision)
      if (decision.allowed) {
        toolAudit.started(toolCall)
        return undefined
      }
      if (decision.approvalRequired && requestToolApproval) {
        const result = await authorize(toolCall, decision)
        if (!result?.block) toolAudit.started(toolCall)
        return result
      }
      const reason = decision.approvalRequired
        ? `${decision.reason}; interactive approval is unavailable`
        : decision.reason
      return { block: true, reason }
    },
    afterToolCall: async ({ result, toolCall }) => {
      toolAudit.finished(toolCall, result)
      onToolCallFinished?.(toolCall, result)
      return undefined
    },
    toolExecution: 'sequential',
  })

  // 5. Subscribe to events -> forward structured progress and persist each transition
  const unsub = agent.subscribe((event) => {
    if (event.type === 'tool_execution_start') {
      if (event.toolName === 'plan_goal') {
        onUpdate?.({ type: 'goal_planning' })
      } else if (event.toolName === 'execute_step') {
        const planIndex = Number(event.args?.step_index)
        const step = goalState.plan?.steps?.[planIndex]
        if (step) {
          onUpdate?.({
            type: 'goal_step_start',
            agent: step.agent,
            task: step.task,
            stepIndex: goalState.steps.length,
          })
        }
      } else if (event.toolName === 'check_progress') {
        onUpdate?.({ type: 'goal_checking' })
      }
    } else if (event.type === 'tool_execution_end') {
      if (event.toolName === 'plan_goal') {
        onUpdate?.({ type: 'goal_plan', plan: goalState.plan })
      } else if (event.toolName === 'execute_step') {
        const executionIndex = event.result?.details?.stepIndex ?? goalState.steps.length - 1
        const step = goalState.steps[executionIndex]
        if (step) {
          onUpdate?.({ type: 'goal_step_end', stepIndex: executionIndex, result: step.result })
        }
      } else if (event.toolName === 'check_progress') {
        onUpdate?.({
          type: 'goal_progress',
          note: goalState.progressNotes[goalState.progressNotes.length - 1] || '',
        })
      }
    } else if (event.type === 'tool_execution_update') {
      onUpdate?.({
        type: 'goal_step_update',
        stepIndex: Math.max(0, goalState.steps.length - 1),
        update: event.partialResult,
      })
    }
    persistFn?.(goalState)
  })

  // 6. Execute
  const initialPrompt = `Goal: ${goalState.goal}

You MUST begin with plan_goal. Then execute every planned step in order with execute_step and call check_progress immediately after each one. Do not claim completion while any planned step is pending, running, or unchecked.`

  let finalOutput = ''
  let usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 }

  try {
    armExecutionTimeout()
    const abortHandler = () => agent.abort()
    signal?.addEventListener('abort', abortHandler, { once: true })

    try {
      await agent.prompt(initialPrompt)
      if (blockedApprovalReason) {
        throw new Error(blockedApprovalReason)
      }

      if (!goalState.plan) {
        throw new Error('Goal agent stopped without creating the required plan.')
      }
      const unfinishedSteps = goalState.plan.steps.filter(
        (step) => step.status === 'pending' || step.status === 'running',
      )
      const uncheckedSteps = goalState.plan.steps.filter((step) => !step.checked)
      const unsuccessfulSteps = goalState.plan.steps.filter(
        (step) => step.status !== 'completed' || step.achieved !== true,
      )
      if (unfinishedSteps.length > 0 || uncheckedSteps.length > 0 || unsuccessfulSteps.length > 0) {
        throw new Error(
          `Goal agent stopped before achieving the plan: ${unfinishedSteps.length} unfinished, ${uncheckedSteps.length} unchecked, and ${unsuccessfulSteps.length} unsuccessful step(s).`,
        )
      }

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
            usage.cost += typeof msg.usage.cost === 'number'
              ? msg.usage.cost
              : msg.usage.cost?.total || 0
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
      pauseExecutionTimeout()
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
