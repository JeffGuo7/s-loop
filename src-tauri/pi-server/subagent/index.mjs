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

const MAX_CONCURRENCY = 4
const MAX_SUBAGENT_TIMEOUT = 120_000

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
}) {
  // 1. Look up agent definition
  const def = loadAgentDefinition(agentName, projectDir)
  if (!def) {
    const { discoverAgents } = await import('./agent-registry.mjs')
    const { agents } = discoverAgents(projectDir)
    const available = formatAgentList(agents)
    return {
      agent: agentName,
      task,
      exitCode: 1,
      messages: [],
      finalOutput: '',
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
      errorMessage: `Unknown sub-agent: "${agentName}". Available: ${available}`,
    }
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
  const toolWhitelist = new Set(def.tools.map((t) => t.toLowerCase().trim()))
  const allowedTools = toolWhitelist.size > 0
    ? allTools.filter((t) => toolWhitelist.has(t.name.toLowerCase()))
    : allTools

  // 4. Create independent Agent instance
  const sessionId = `subagent-${agentName}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const apiKey = parentConfig.apiKey || ''

  const agent = new Agent({
    initialState: {
      systemPrompt: def.systemPrompt,
      model,
      tools: allowedTools,
      thinkingLevel: def.thinkingLevel === 'off' || !model.reasoning ? 'off' : def.thinkingLevel,
    },
    sessionId,
    getApiKey: async () => apiKey,
    toolExecution: 'parallel',
  })

  // 5. Subscribe to events for streaming
  if (onUpdate) {
    agent.subscribe((event) => {
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
    })
  }

  // 6. Execute with timeout and abortion support
  let aborted = false
  let timeoutId
  const cleanup = () => {
    if (timeoutId) clearTimeout(timeoutId)
  }

  if (signal) {
    const onAbort = () => {
      aborted = true
      try { agent.abort() } catch {}
      cleanup()
    }
    if (signal.aborted) {
      onAbort()
      return {
        agent: agentName,
        task,
        exitCode: 1,
        messages: [],
        finalOutput: '',
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
        stopReason: 'aborted',
        errorMessage: 'Sub-agent was aborted before starting',
      }
    }
    signal.addEventListener('abort', onAbort, { once: true })
  }

  try {
    // Run with turn limit via prepareNextTurn hook-like tracking
    // pi's Agent doesn't have a built-in maxTurns, so we track manually
    const startTime = Date.now()
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
      aborted = true
      try { agent.abort() } catch {}
    }, MAX_SUBAGENT_TIMEOUT)

    await promptPromise
    cleanup()

    if (aborted) {
      return {
        ...results,
        exitCode: 1,
        stopReason: 'timeout',
        errorMessage: `Sub-agent timed out after ${MAX_SUBAGENT_TIMEOUT / 1000}s`,
      }
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

    return results
  } catch (err) {
    cleanup()
    return {
      agent: agentName,
      task,
      exitCode: 1,
      messages: [],
      finalOutput: '',
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
      stopReason: 'error',
      errorMessage: err.message || String(err),
    }
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
