/**
 * Sub-agent Runner — Execute sub-agents as independent Agent instances
 *
 * Unlike pi's subagent extension (which spawns OS processes),
 * this creates Agent instances within the same Node.js process.
 *
 * Features:
 *   - Independent Agent instance per sub-agent (isolated messages, tools, model)
 *   - Tool whitelist filtering
 *   - Turn limit enforcement
 *   - Streaming event forwarding
 *   - Concurrency control (max 4 parallel)
 */

import { Agent } from '@earendil-works/pi-agent-core'
import { loadAgentDefinition, formatAgentList } from './agent-registry.mjs'
import { evaluateToolCall } from '../execution-policy.mjs'
import { buildToolSecurityIndex } from '../tool-security.mjs'
import { appendAuditEvent, createToolAuditTracker } from '../audit-store.mjs'
import { deriveSubagentAuthority } from './authority.mjs'
import { resolveThinkingLevel } from '../reasoning-capabilities.mjs'
import {
  beginSubagentRun,
  completeSubagentRun,
  updateSubagentRun,
} from './run-store.mjs'

const MAX_CONCURRENCY = 4
const MAX_SUBAGENT_TIMEOUT = 300_000  // 5 minutes

/**
 * Run a single sub-agent.
 *
 * @param {Object} opts
 * @param {string} opts.agentName - Which sub-agent to invoke
 * @param {string} opts.task - Task description for the sub-agent
 * @param {Object} opts.parentConfig - Parent's runtime config (apiKey, workspaceDir, etc.)
 * @param {Function} opts.resolveModel - (providerID, modelID, providerConfig) => model object
 * @param {Function} opts.getTools - (workspaceDir, webSearchConfig) => tool array
 * @param {AbortSignal} [opts.signal] - Abort signal
 * @param {Function} [opts.onUpdate] - Streaming update callback
 * @param {string} [opts.projectDir] - Project directory for agent discovery
 * @param {Function} [opts.requestToolApproval] - interactive parent policy hook
 * @param {Function} [opts.onToolCallFinished] - approval completion callback
 * @param {Object} [opts.auditContext] - surface/run correlation metadata
 * @returns {Promise<Object>} SubagentResult
 */
export async function runSubagent({
  agentName,
  task,
  parentConfig = {},
  resolveModel,
  getTools,
  signal,
  onUpdate,
  projectDir,
  requestToolApproval,
  onToolCallFinished,
  auditContext,
}) {
  const tracking = beginSubagentRun({
    agent: agentName,
    task,
    parent: auditContext?.actor || parentConfig.agentId || 'unknown',
    budget: {
      maxTurns: Number(parentConfig.maxSubagentTurns) || 20,
      maxTokens: Number(parentConfig.maxSubagentTokens) || 100_000,
      timeoutMs: MAX_SUBAGENT_TIMEOUT,
    },
  })
  let effectiveBudget = {
    maxTurns: Number(parentConfig.maxSubagentTurns) || 20,
    maxTokens: Number(parentConfig.maxSubagentTokens) || 100_000,
    timeoutMs: MAX_SUBAGENT_TIMEOUT,
  }
  const startedAt = Date.now()
  const finalize = (result) => {
    const enriched = {
      ...result,
      runId: tracking.runId,
      durationMs: Date.now() - startedAt,
      budget: { ...effectiveBudget },
    }
    completeSubagentRun(tracking.runId, enriched)
    appendAuditEvent('subagent.finished', {
      surface: auditContext?.surface || 'subagent',
      surfaceId: auditContext?.surfaceId || tracking.runId,
      runId: tracking.runId,
      actor: `subagent:${agentName}`,
      outcome: enriched.exitCode === 0 ? 'completed' : 'failed',
      details: {
        parentRunId: auditContext?.runId,
        stopReason: enriched.stopReason,
        durationMs: enriched.durationMs,
        usage: enriched.usage,
        budget: enriched.budget,
        errorMessage: enriched.errorMessage,
      },
    })
    onUpdate?.({ type: 'run_end', agentName, runId: tracking.runId, result: enriched })
    return enriched
  }
  appendAuditEvent('subagent.started', {
    surface: auditContext?.surface || 'subagent',
    surfaceId: auditContext?.surfaceId || tracking.runId,
    runId: tracking.runId,
    actor: `subagent:${agentName}`,
    outcome: 'running',
    details: {
      parentRunId: auditContext?.runId,
      parent: auditContext?.actor || parentConfig.agentId,
      budget: effectiveBudget,
    },
  })
  onUpdate?.({ type: 'run_start', agentName, runId: tracking.runId, budget: effectiveBudget })

  // 1. Look up agent definition
  const def = loadAgentDefinition(agentName, projectDir)
  if (!def) {
    const { discoverAgents } = await import('./agent-registry.mjs')
    const { agents } = discoverAgents(projectDir)
    const available = formatAgentList(agents)
    return finalize({
      agent: agentName,
      task,
      exitCode: 1,
      messages: [],
      finalOutput: '',
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
      errorMessage: `Unknown sub-agent: "${agentName}". Available: ${available}`,
    })
  }

  // 2. Resolve model
  const providerID = parentConfig.providerID || 'anthropic'
  const modelID = def.model || parentConfig.modelID || 'claude-sonnet-4-20250514'
  const providerConfig = parentConfig.providerConfig || {}
  let model
  if (resolveModel) {
    model = resolveModel(providerID, modelID, providerConfig)
  }
  if (!model) {
    // Fallback: build a minimal model object
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

  // 3. Build tool whitelist
  const allTools = getTools
    ? getTools(parentConfig.workspaceDir, parentConfig.webSearchConfig)
    : []
  let authority
  try {
    authority = deriveSubagentAuthority(def, parentConfig, allTools)
  } catch (error) {
    return finalize({
      agent: agentName,
      task,
      exitCode: 1,
      messages: [],
      finalOutput: '',
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
      stopReason: 'denied',
      errorMessage: error?.message || String(error),
    })
  }
  effectiveBudget = {
    maxTurns: authority.maxTurns,
    maxTokens: authority.maxTokens,
    timeoutMs: MAX_SUBAGENT_TIMEOUT,
  }
  updateSubagentRun(tracking.runId, { budget: effectiveBudget })
  const allowedTools = authority.allowedTools
  const effectiveConfig = {
    ...authority.config,
    toolSecurity: buildToolSecurityIndex(allowedTools),
  }
  const toolAudit = createToolAuditTracker({
    ...(auditContext || {}),
    actor: `subagent:${agentName}`,
    parentAgent: effectiveConfig.delegationParent,
    delegationDepth: effectiveConfig.delegationDepth,
  })

  // 4. Create independent Agent instance
  const sessionId = `subagent-${agentName}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const apiKey = parentConfig.apiKey || ''

  const agent = new Agent({
    initialState: {
      systemPrompt: def.systemPrompt,
      model,
      tools: allowedTools,
      thinkingLevel: resolveThinkingLevel(model, def.thinkingLevel || 'off'),
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
        const result = await requestToolApproval(toolCall, decision)
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
    // Durable approvals expose one pending side effect at a time.
    toolExecution: requestToolApproval ? 'sequential' : 'parallel',
  })

  // 5. Subscribe to events for streaming
  let completedTurns = 0
  let turnLimitReached = false
  let tokenLimitReached = false
  const liveUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 }
  agent.subscribe((event) => {
      if (event.type === 'message_end' && event.message?.role === 'assistant') {
        completedTurns += 1
        liveUsage.turns = completedTurns
        liveUsage.input += event.message.usage?.input || 0
        liveUsage.output += event.message.usage?.output || 0
        liveUsage.cacheRead += event.message.usage?.cacheRead || 0
        liveUsage.cacheWrite += event.message.usage?.cacheWrite || 0
        liveUsage.cost += event.message.usage?.cost?.total || 0
        updateSubagentRun(tracking.runId, { usage: liveUsage })
        if (
          completedTurns >= authority.maxTurns
          && ['toolUse', 'tool_use'].includes(event.message?.stopReason)
        ) {
          turnLimitReached = true
          tracking.abort('turn-limit')
        }
        if (
          liveUsage.input + liveUsage.output >= authority.maxTokens
          && ['toolUse', 'tool_use'].includes(event.message?.stopReason)
        ) {
          tokenLimitReached = true
          tracking.abort('token-limit')
        }
      }
      if (onUpdate) {
      switch (event.type) {
        case 'message_start':
          onUpdate({ type: 'message_start', agentName, data: event.message })
          break
        case 'message_update': {
          const ev = event.assistantMessageEvent
          if (ev?.type === 'text_delta') {
            onUpdate({ type: 'text_delta', agentName, delta: ev.delta })
          } else if (ev?.type === 'thinking_delta') {
            onUpdate({ type: 'thinking_delta', agentName, delta: ev.delta })
          }
          break
        }
        case 'message_end':
          onUpdate({ type: 'message_end', agentName, message: event.message })
          break
        case 'tool_execution_start':
          onUpdate({ type: 'tool_start', agentName, toolName: event.toolName, args: event.args })
          break
        case 'tool_execution_end':
          onUpdate({ type: 'tool_end', agentName, toolName: event.toolName, result: event.result, isError: event.isError })
          break
      }
      }
    })

  // 6. Execute with timeout and abortion support
  let aborted = false
  let abortReason = ''
  let timeoutId
  const cleanup = () => {
    if (timeoutId) clearTimeout(timeoutId)
  }

  const onTrackedAbort = () => {
    aborted = true
    abortReason = String(tracking.signal.reason || 'cancelled')
    try { agent.abort() } catch {}
    cleanup()
  }
  tracking.signal.addEventListener('abort', onTrackedAbort, { once: true })

  if (signal) {
    const onParentAbort = () => tracking.abort('parent-aborted')
    if (signal.aborted) {
      onParentAbort()
      return finalize({
        agent: agentName,
        task,
        exitCode: 1,
        messages: [],
        finalOutput: '',
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
        stopReason: 'cancelled',
        errorMessage: 'Sub-agent was aborted before starting',
      })
    }
    signal.addEventListener('abort', onParentAbort, { once: true })
  }

  try {
    // Run with turn limit via prepareNextTurn hook-like tracking
    // pi's Agent doesn't have a built-in maxTurns, so we track manually
    const results = {
      agent: agentName,
      task,
      exitCode: 0,
      messages: [],
      finalOutput: '',
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
      model: modelID,
    }

    const promptPromise = agent.prompt(task)

    timeoutId = setTimeout(() => {
      tracking.abort('timeout')
    }, MAX_SUBAGENT_TIMEOUT)

    await promptPromise
    cleanup()

    if (aborted) {
      const stopReason = abortReason === 'timeout'
        ? 'timeout'
        : abortReason === 'turn-limit'
          ? 'turn-limit'
          : abortReason === 'token-limit'
            ? 'token-limit'
            : 'cancelled'
      return finalize({
        ...results,
        exitCode: 1,
        stopReason,
        usage: { ...liveUsage },
        errorMessage: stopReason === 'timeout'
          ? `Sub-agent timed out after ${MAX_SUBAGENT_TIMEOUT / 1000}s`
          : stopReason === 'turn-limit'
            ? `Sub-agent reached its ${authority.maxTurns}-turn authority budget`
            : stopReason === 'token-limit'
              ? `Sub-agent reached its ${authority.maxTokens}-token authority budget`
              : 'Sub-agent was cancelled',
      })
    }
    if (turnLimitReached) {
      return finalize({
        ...results,
        exitCode: 1,
        stopReason: 'turn-limit',
        usage: { ...liveUsage },
        errorMessage: `Sub-agent reached its ${authority.maxTurns}-turn authority budget`,
      })
    }
    if (tokenLimitReached || liveUsage.input + liveUsage.output > authority.maxTokens) {
      return finalize({
        ...results,
        exitCode: 1,
        stopReason: 'token-limit',
        usage: { ...liveUsage },
        errorMessage: `Sub-agent reached its ${authority.maxTokens}-token authority budget`,
      })
    }

    // 7. Collect results
    const messages = agent.state.messages
    results.messages = [...messages]

    // Count turns (assistant messages)
    results.usage.turns = messages.filter((m) => m.role === 'assistant').length

    // Aggregate usage from assistant messages
    for (const msg of messages) {
      if (msg.role === 'assistant' && msg.usage) {
        results.usage.input += msg.usage.input || 0
        results.usage.output += msg.usage.output || 0
        results.usage.cacheRead += msg.usage.cacheRead || 0
        results.usage.cacheWrite += msg.usage.cacheWrite || 0
        results.usage.cost += msg.usage.cost?.total || 0
      }
    }

    // Extract final output
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
    if (lastAssistant) {
      const textPart = lastAssistant.content?.find((c) => c.type === 'text')
      results.finalOutput = textPart?.text || ''
      results.stopReason = lastAssistant.stopReason
      if (lastAssistant.errorMessage) {
        results.errorMessage = lastAssistant.errorMessage
        results.exitCode = 1
      }
    }

    if (!results.finalOutput && results.errorMessage) {
      results.finalOutput = `Error: ${results.errorMessage}`
    }

    return finalize(results)
  } catch (err) {
    cleanup()
    const wasCancelled = aborted
    const stopReason = wasCancelled
      ? abortReason === 'timeout'
        ? 'timeout'
        : abortReason === 'turn-limit'
          ? 'turn-limit'
          : abortReason === 'token-limit'
            ? 'token-limit'
            : 'cancelled'
      : 'error'
    return finalize({
      agent: agentName,
      task,
      exitCode: 1,
      messages: [],
      finalOutput: '',
      usage: { ...liveUsage },
      stopReason,
      errorMessage: wasCancelled ? `Sub-agent stopped: ${stopReason}` : err.message || String(err),
    })
  }
}

/**
 * Run multiple sub-agents in parallel with concurrency limit.
 *
 * @param {Array<{agent: string, task: string}>} tasks
 * @param {number} concurrency - Max concurrent sub-agents (default 4)
 * @param {Object} opts - Same opts as runSubagent (without agentName/task)
 * @returns {Promise<Array>} Array of SubagentResult
 */
export async function runParallel(tasks, concurrency, opts) {
  if (!tasks || tasks.length === 0) return []

  const limit = Math.max(1, Math.min(concurrency || MAX_CONCURRENCY, tasks.length))
  const results = new Array(tasks.length)
  let nextIndex = 0

  const workers = new Array(limit).fill(null).map(async () => {
    while (true) {
      const current = nextIndex++
      if (current >= tasks.length) return

      const t = tasks[current]
      try {
        results[current] = await runSubagent({
          ...opts,
          agentName: t.agent,
          task: t.task,
        })
      } catch (err) {
        results[current] = {
          agent: t.agent,
          task: t.task,
          exitCode: 1,
          messages: [],
          finalOutput: '',
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
          errorMessage: err.message || String(err),
        }
      }
    }
  })

  await Promise.all(workers)
  return results
}

/**
 * Run sub-agents in chain mode — each step receives output from previous step.
 *
 * @param {Array<{agent: string, task: string}>} chain
 * @param {Object} opts - Same opts as runSubagent (without agentName/task)
 * @returns {Promise<{results: Array, finalOutput: string}>}
 */
export async function runChain(chain, opts) {
  if (!chain || chain.length === 0) return { results: [], finalOutput: '' }

  const results = []
  let previousOutput = ''

  for (let i = 0; i < chain.length; i++) {
    const step = chain[i]
    const taskWithContext = step.task.replace(/\{previous\}/g, previousOutput)

    const result = await runSubagent({
      ...opts,
      agentName: step.agent,
      task: taskWithContext,
    })

    result.step = i + 1
    results.push(result)

    if (result.exitCode !== 0) {
      break // Stop chain on first failure
    }

    previousOutput = result.finalOutput
  }

  return {
    results,
    finalOutput: results.length > 0 ? results[results.length - 1].finalOutput : '',
  }
}
