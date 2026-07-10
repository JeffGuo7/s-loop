// Token estimation helpers for context compression.
// Uses conservative character heuristics when real usage is unavailable.

export const CHARS_PER_TOKEN = 2
export const IMAGE_TOKEN_ESTIMATE = 1600

function countChars(value) {
  if (typeof value === 'string') return value.length
  if (value == null) return 0
  return String(value).length
}

function estimateContentTokens(content) {
  if (typeof content === 'string') {
    return Math.ceil(content.length / CHARS_PER_TOKEN)
  }
  if (!Array.isArray(content)) return 0

  let chars = 0
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    switch (block.type) {
      case 'text':
        chars += countChars(block.text)
        break
      case 'thinking':
        chars += countChars(block.thinking)
        break
      case 'toolCall':
        chars += countChars(block.name) + countChars(JSON.stringify(block.arguments))
        break
      case 'image':
      case 'image_url':
      case 'input_image':
        chars += IMAGE_TOKEN_ESTIMATE * CHARS_PER_TOKEN
        break
    }
  }
  return Math.ceil(chars / CHARS_PER_TOKEN)
}

/** Estimate token count for a single Agent message. */
export function estimateTokens(message) {
  if (!message) return 0
  switch (message.role) {
    case 'user':
      return estimateContentTokens(message.content)
    case 'assistant':
      return estimateContentTokens(message.content)
    case 'toolResult':
      return estimateContentTokens(message.content)
    default:
      return estimateContentTokens(message.content)
  }
}

/** Sum tokens for a message list. */
export function calculateContextTokens(messages) {
  return messages.reduce((sum, m) => sum + estimateTokens(m), 0)
}

/** Compute trailing tokens after a given index. */
export function calculateTrailingTokens(messages, fromIndex) {
  let tokens = 0
  for (let i = fromIndex; i < messages.length; i++) {
    tokens += estimateTokens(messages[i])
  }
  return tokens
}

/** Resolve context length for a model object or fallback default. */
export function resolveContextLength(model, fallback = 200_000) {
  if (model?.contextLength) return model.contextLength
  // Common model family defaults
  const id = (model?.id || '').toLowerCase()
  if (id.includes('claude-3-opus')) return 200_000
  if (id.includes('claude-3-5-sonnet')) return 200_000
  if (id.includes('claude-sonnet-4')) return 200_000
  if (id.includes('claude-3-sonnet')) return 200_000
  if (id.includes('claude-3-haiku')) return 200_000
  if (id.includes('gpt-4o')) return 128_000
  if (id.includes('gpt-4-turbo')) return 128_000
  if (id.includes('gpt-4-32k')) return 32_768
  if (id.includes('gpt-4')) return 8_192
  if (id.includes('deepseek')) return 64_000
  return fallback
}
