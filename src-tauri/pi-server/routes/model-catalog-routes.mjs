// Model catalog routes: builtin + custom model listing, provider catalog,
// and reasoning-capability resolution.

import { getModel, getModels, getProviders } from '@earendil-works/pi-ai/compat'
import {
  describeModel,
  describeReasoningCapabilities,
  resolveCustomReasoningConfig,
} from '../reasoning-capabilities.mjs'

export function createCustomModel(providerID, modelID, providerConfig = {}) {
  const api = providerConfig.api || 'openai-completions'
  const baseUrl = providerConfig.baseUrl || ''
  const reasoningConfig = resolveCustomReasoningConfig(providerID, modelID, providerConfig)
  // Custom models can declare vision support via providerConfig.supportsVision
  const supportsVision = providerConfig.supportsVision === true
  return {
    id: modelID,
    name: modelID,
    api,
    provider: providerID,
    baseUrl,
    reasoning: reasoningConfig.reasoning,
    thinkingLevelMap: reasoningConfig.thinkingLevelMap,
    input: supportsVision ? ['text', 'image'] : ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    contextLength: 128000,
    // Reasoning models routinely spend thousands of tokens thinking before
    // any visible content; a small cap leaves them truncated with empty
    // replies. Aligned with the largest catalog default (glm-5.3-flash).
    maxTokens: 131072,
    ...(reasoningConfig.compat ? { compat: reasoningConfig.compat } : {}),
  }
}

export function resolveModel(providerID, modelID, providerConfig = {}) {
  const builtIn = getModel(providerID, modelID)
  if (builtIn) return builtIn
  if (providerConfig?.api || providerConfig?.baseUrl) {
    return createCustomModel(providerID, modelID, providerConfig)
  }
  return null
}

async function fetchOpenAiCompatibleModels(baseUrl, apiKey) {
  const url = new URL('/models', baseUrl.replace(/\/$/, ''))
  const headers = {}
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
  try {
    const res = await fetch(url.toString(), { headers })
    if (!res.ok) return []
    const data = await res.json()
    const models = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []
    return models.map((m) => ({ id: m.id, name: m.id })).filter((m) => m.id)
  } catch (err) {
    console.warn('[pi-server] failed to fetch custom provider models:', err)
    return []
  }
}

export function handleModelCatalogRoutes(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/models') {
    (async () => {
      const provider = url.searchParams.get('provider') || 'anthropic'
      const apiKey = url.searchParams.get('apiKey') || ''
      const baseUrl = url.searchParams.get('baseUrl') || ''
      const providerConfig = {
        api: url.searchParams.get('api') || undefined,
        baseUrl,
        reasoningSupport: url.searchParams.get('reasoningSupport') || 'auto',
        thinkingFormat: url.searchParams.get('thinkingFormat') || 'auto',
      }
      let list = []
      try {
        const builtIn = getModels(provider).map(describeModel)
        if (builtIn.length > 0) {
          list = builtIn
        } else if (baseUrl) {
          const remoteModels = await fetchOpenAiCompatibleModels(baseUrl, apiKey)
          list = remoteModels.map(({ id }) => describeModel(createCustomModel(provider, id, providerConfig)))
        }
      } catch { }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(list))
    })().catch((e) => {
      console.error('[pi-server] /models error:', e)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify([]))
    })
    return true
  }

  // GET /providers — full builtin provider catalog from the pi SDK, so the
  // frontend picker tracks the SDK instead of a hardcoded list.
  if (req.method === 'GET' && url.pathname === '/providers') {
    (async () => {
      const list = getProviders()
        .map((id) => {
          const models = getModels(id)
          return { id, models: models.length, baseUrl: models[0]?.baseUrl || '', api: models[0]?.api || '' }
        })
        .filter((p) => p.models > 0)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(list))
    })().catch((e) => {
      console.error('[pi-server] /providers error:', e)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify([]))
    })
    return true
  }

  if (req.method === 'GET' && url.pathname === '/model-capabilities') {
    const provider = url.searchParams.get('provider') || 'anthropic'
    const modelID = url.searchParams.get('model') || ''
    const providerConfig = {
      api: url.searchParams.get('api') || undefined,
      baseUrl: url.searchParams.get('baseUrl') || '',
      reasoningSupport: url.searchParams.get('reasoningSupport') || 'auto',
      thinkingFormat: url.searchParams.get('thinkingFormat') || 'auto',
    }
    const model = resolveModel(provider, modelID, providerConfig)
    const capabilities = model
      ? describeReasoningCapabilities(model)
      : describeReasoningCapabilities({ reasoning: false })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(capabilities))
    return true
  }

  return false
}
