export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

const CUSTOM_REASONING_MODEL_PATTERN = /(?:^|[\/_-])(reasoner|reasoning|r1|qwq|o[134]|gpt-5|deepseek-v4|gemini-(?:2\.5|3)|claude-(?:opus|sonnet)-4)(?:$|[\/_-])/i

export function getSupportedThinkingLevels(model) {
  if (!model?.reasoning) return ['off']

  return THINKING_LEVELS.filter((level) => {
    const mapped = model.thinkingLevelMap?.[level]
    if (mapped === null) return false
    if (level === 'xhigh' || level === 'max') return mapped !== undefined
    return true
  })
}

export function resolveThinkingLevel(model, requested = 'medium') {
  const available = getSupportedThinkingLevels(model)
  if (available.includes(requested)) return requested

  const requestedIndex = THINKING_LEVELS.indexOf(requested)
  if (requestedIndex === -1) return resolveThinkingLevel(model, 'medium')

  for (let index = requestedIndex; index < THINKING_LEVELS.length; index += 1) {
    if (available.includes(THINKING_LEVELS[index])) return THINKING_LEVELS[index]
  }
  for (let index = requestedIndex - 1; index >= 0; index -= 1) {
    if (available.includes(THINKING_LEVELS[index])) return THINKING_LEVELS[index]
  }
  return 'off'
}

export function describeReasoningCapabilities(model) {
  const supportedThinkingLevels = getSupportedThinkingLevels(model)
  return {
    reasoning: model?.reasoning === true,
    supportedThinkingLevels,
    recommendedThinkingLevel: resolveThinkingLevel(model, 'medium'),
  }
}

function inferThinkingFormat(providerID, baseUrl) {
  const target = `${providerID} ${baseUrl}`.toLowerCase()
  if (target.includes('openrouter')) return 'openrouter'
  if (target.includes('deepseek')) return 'deepseek'
  if (target.includes('together')) return 'together'
  if (target.includes('z.ai') || target.includes('bigmodel')) return 'zai'
  return 'openai'
}

export function resolveCustomReasoningConfig(providerID, modelID, providerConfig = {}) {
  const support = providerConfig.reasoningSupport || 'auto'
  const reasoning = support === 'enabled'
    || (support === 'auto' && CUSTOM_REASONING_MODEL_PATTERN.test(modelID || ''))
  const requestedFormat = providerConfig.thinkingFormat
  const thinkingFormat = requestedFormat && requestedFormat !== 'auto'
    ? requestedFormat
    : inferThinkingFormat(providerID, providerConfig.baseUrl || '')

  if (!reasoning) return { reasoning: false, thinkingLevelMap: undefined, compat: undefined }

  if (thinkingFormat === 'deepseek') {
    return {
      reasoning: true,
      thinkingLevelMap: {
        minimal: null,
        low: null,
        medium: null,
        high: 'high',
        max: 'max',
      },
      compat: { thinkingFormat: 'deepseek', supportsReasoningEffort: true },
    }
  }

  return {
    reasoning: true,
    thinkingLevelMap: undefined,
    compat: {
      thinkingFormat,
      supportsReasoningEffort: !['qwen', 'together', 'zai'].includes(thinkingFormat),
    },
  }
}
