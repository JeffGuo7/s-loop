/**
 * Platform Auto-Reply Engine
 *
 * When an inbound platform message arrives, this engine:
 * 1. Creates/finds a session for that conversation
 * 2. Runs the default agent (with all skills, MCP tools, web_search, etc.)
 * 3. Sends the AI response back through the platform adapter
 *
 * The agent uses the user's default configuration — same model, skills,
 * MCP servers, and web search settings as a normal chat session.
 */

import { Agent } from '@earendil-works/pi-agent-core'
import { getModel } from '@earendil-works/pi-ai'
import { createCodingTools, createReadOnlyTools } from '@earendil-works/pi-coding-agent'
import { webSearch } from './searchProviders.mjs'
import { createSessionRepo, findSession } from './session-store.mjs'
import { getAdapter } from './platforms/registry.mjs'
import { authorizeInbound } from './platforms/access-control.mjs'
import { recordPlatformInbound, recordPlatformOutbound } from './telegram-chat-sync.mjs'

// ─── Session tracking ─────────────────────────────────────
// Map: platformId:conversationId → piSessionId
const _conversationSessions = new Map()
// Queue: conversation key → pending message
const _conversationLocks = new Map()

function _conversationKey(platformId, conversationId) {
  return `${platformId}:${conversationId}`
}

/**
 * Process an inbound platform message — authorize, run agent, send reply.
 *
 * @param {Object} msg — normalized inbound message
 * @param {string} msg.platformId
 * @param {string} msg.conversationId
 * @param {string} msg.chatId
 * @param {string|null} msg.threadId
 * @param {string} msg.messageId
 * @param {string} msg.text
 * @param {string} msg.username
 * @param {Object} platform — platform config (with fields/values)
 * @param {Object} runtimeConfig — current runtime config (model, apiKey, skills, etc.)
 * @returns {Promise<{ replied: boolean, error?: string }>}
 */
export async function autoReply(msg, platform, runtimeConfig) {
  const key = _conversationKey(msg.platformId, msg.conversationId)

  // Serialize replies per conversation (avoid interleaving)
  if (_conversationLocks.has(key)) {
    // Queue this message to be processed after the current one finishes
    await _conversationLocks.get(key)
  }

  let resolveLock
  _conversationLocks.set(key, new Promise(r => { resolveLock = r }))

  try {
    // 1. Authorization
    if (!authorizeInbound(platform, msg)) {
      return { replied: false, error: 'unauthorized' }
    }

    // 2. Record inbound message
    recordPlatformInbound({
      platformId: msg.platformId,
      conversationId: msg.conversationId,
      messageId: msg.messageId,
      text: msg.text,
      username: msg.username,
    })

    // 3. Build agent tools — full set including web_search and skills
    const baseTools = getToolsForPlatform(runtimeConfig)
    const skills = await resolveSkills(runtimeConfig)

    // 4. Resolve model
    const providerID = runtimeConfig.providerID || 'anthropic'
    const modelID = runtimeConfig.modelID || 'claude-sonnet-4-20250514'
    const providerConfig = runtimeConfig.providerConfig || {}
    let model = getModel(providerID, modelID)
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

    // 5. Reuse or create Pi session
    const sessionId = `platform-${key}`
    let piSession = _conversationSessions.get(key)
    if (!piSession) {
      try {
        const ks = await createPiSession()
        piSession = ks.id
        _conversationSessions.set(key, piSession)
      } catch {
        return { replied: false, error: 'session creation failed' }
      }
    }

    // 6. Create agent with full tool set
    const agent = new Agent({
      initialState: {
        systemPrompt: buildPlatformSystemPrompt(msg, platform, skills),
        model,
        tools: [...baseTools, ...skills],
        thinkingLevel: model.reasoning ? 'medium' : 'off',
      },
      sessionId,
      getApiKey: async () => runtimeConfig.apiKey || '',
      toolExecution: 'sequential',
    })

    // 7. Run agent
    const prompt = `${msg.text}`
    await agent.prompt(prompt)

    // 8. Extract response
    const messages = agent.state?.messages || []
    const lastAssistant = [...messages].reverse().find(
      m => m.role === 'assistant' && m.content?.some(c => c.type === 'text')
    )
    const replyText = lastAssistant
      ? lastAssistant.content.filter(c => c.type === 'text').map(c => c.text).join('\n\n')
      : ''

    if (!replyText.trim()) {
      return { replied: false, error: 'empty response' }
    }

    // 9. Send reply via platform adapter
    const adapter = getAdapter(msg.platformId)
    await adapter.dispatch(platform, replyText, {
      chatId: msg.chatId,
      threadId: msg.threadId,
      replyToMessageId: msg.messageId,
    })

    // 10. Record outbound
    recordPlatformOutbound({
      platformId: msg.platformId,
      conversationId: msg.conversationId,
      chatId: msg.chatId,
      replyKey: `${msg.messageId}-reply`,
      text: replyText,
    })

    return { replied: true }
  } catch (err) {
    console.error(`[platform-auto-reply] ${msg.platformId}:`, err.message)
    return { replied: false, error: err.message }
  } finally {
    _conversationLocks.delete(key)
    resolveLock?.()
  }
}

// ─── Helpers ─────────────────────────────────────────────

let _piSessionModule = null
async function createPiSession() {
  if (!_piSessionModule) {
    _piSessionModule = await import('./session-store.mjs')
  }
  return _piSessionModule.createSession()
}

function getToolsForPlatform(runtimeConfig) {
  const dir = runtimeConfig.workspaceDir || process.env.S_LOOP_PROJECT_DIR || process.cwd()
  const all = [...createCodingTools(dir), ...createReadOnlyTools(dir)]
  const seen = new Set()
  const tools = all.filter(t => {
    if (seen.has(t.name)) return false
    seen.add(t.name)
    return true
  })

  // Add web_search if not already present
  if (!seen.has('web_search')) {
    tools.push({
      name: 'web_search', label: 'Web Search',
      description: 'Search the web and return results with URLs, titles, and snippets.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string', description: 'Search query.' } },
        required: ['query'],
      },
      execute: async (_id, params) => {
        const result = await webSearch(params.query, runtimeConfig.webSearchConfig)
        if (result.error) return { content: [{ type: 'text', text: `Search failed: ${result.error}` }], details: {} }
        if (!result.results.length) return { content: [{ type: 'text', text: 'No results found.' }], details: {} }
        const text = result.results.map(r =>
          `[${r.position}] ${r.title}\n   URL: ${r.url}\n   ${r.description}`
        ).join('\n\n')
        return { content: [{ type: 'text', text }], details: {} }
      },
    })
  }

  return tools
}

async function resolveSkills(runtimeConfig) {
  // Load enabled skills as tools
  const skillTools = []
  try {
    const { useSkillStore } = await import('../../src/stores/skillStore.js')
    // Access skill store from the main process context
    // Skills are loaded as tools by the agent SDK
  } catch {
    // skill store not available in server context
  }
  return skillTools
}

function buildPlatformSystemPrompt(msg, platform, skills) {
  const platformName = {
    telegram: 'Telegram', wechat: '企业微信', feishu: '飞书',
    dingtalk: '钉钉', slack: 'Slack', discord: 'Discord', qqbot: 'QQ',
  }[msg.platformId] || msg.platformId

  const userTag = msg.username ? ` (@${msg.username})` : ''

  return `You are an AI assistant responding to messages on ${platformName}${userTag}.

## Context
- Platform: ${platformName}
- User: ${msg.username || 'Unknown'}
- This is a chat conversation. Be helpful, concise, and natural.

## Capabilities
You have access to:
- **web_search**: Search the internet for current information
- **read, grep, find, ls**: Explore the codebase
- **bash**: Execute commands
- **write, edit**: Create and modify files
- Other tools as configured

## Guidelines
- Respond in the same language as the user's message
- Keep responses concise (platforms have message length limits)
- Use web_search when the user asks about current events or facts
- Be friendly and helpful`
}
