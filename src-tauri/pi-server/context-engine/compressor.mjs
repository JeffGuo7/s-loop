// Context compression engine using pi-agent-core AgentHarness compaction utilities.

import {
  calculateContextTokens,
  estimateContextTokens,
  shouldCompact,
  DEFAULT_COMPACTION_SETTINGS,
  prepareCompaction,
  compact,
} from '@earendil-works/pi-agent-core'
import { resolveContextLength } from './token-utils.mjs'
import { truncateToolResult as truncateToolResultMessage } from './truncate.mjs'
import { SUMMARY_PREFIX, SUMMARY_END_MARKER, FALLBACK_COMPACTION_NOTE, IDENTIFIER_PRESERVATION_INSTRUCTIONS } from './prompts.mjs'

/** Build synthetic session entries from a flat message list so we can reuse
 *  the harness compaction algorithm (turn-aware cutting, split-turn handling). */
function messagesToEntries(messages) {
  let parentId = null
  return messages.map((message, index) => {
    const id = `entry-${index}`
    const entry = { type: 'message', message, id, parentId }
    parentId = id
    return entry
  })
}

export class ContextEngine {
  constructor(options = {}) {
    this.contextLength = options.contextLength || 200_000
    this.settings = {
      enabled: options.enabled ?? true,
      reserveTokens: options.reserveTokens ?? DEFAULT_COMPACTION_SETTINGS.reserveTokens,
      keepRecentTokens: options.keepRecentTokens ?? DEFAULT_COMPACTION_SETTINGS.keepRecentTokens,
    }
    this.lastTotalTokens = 0
    this.compressionCount = 0
  }

  get thresholdTokens() {
    return this.contextLength - this.settings.reserveTokens
  }

  /** Update token usage from a real LLM response. */
  updateFromResponse(usage) {
    this.lastTotalTokens = usage ? calculateContextTokens(usage) : 0
  }

  /** Decide whether compression is needed. */
  shouldCompress(currentTokens = this.lastTotalTokens) {
    return shouldCompact(currentTokens, this.contextLength, this.settings)
  }

  /** Main compression entry point. Base implementation is a no-op. */
  async compress(messages, options = {}) {
    return messages
  }

  /** Truncate oversized tool results. */
  truncateToolResult(message) {
    return truncateToolResultMessage(message)
  }
}

export class ContextCompressor extends ContextEngine {
  constructor(options = {}) {
    super(options)
  }

  async compress(messages, options = {}) {
    const { model, apiKey, onStatus, signal } = options

    const estimate = estimateContextTokens(messages)
    if (!this.shouldCompress(estimate.tokens)) {
      return messages
    }

    onStatus?.({ type: 'compacting', message: 'Compacting context…' })

    const entries = messagesToEntries(messages)
    const preparationResult = prepareCompaction(entries, this.settings)
    if (!preparationResult.ok) {
      console.warn('[context-engine] prepareCompaction failed:', preparationResult.error)
      return messages
    }

    const preparation = preparationResult.value
    if (!preparation) {
      return messages
    }

    let compactResult
    try {
      compactResult = await compact(preparation, model, apiKey, undefined, IDENTIFIER_PRESERVATION_INSTRUCTIONS, signal)
    } catch (err) {
      console.warn('[context-engine] compact failed, falling back to compaction note:', err)
      return this._fallbackCompact(messages, preparation, estimate.tokens)
    }

    if (!compactResult.ok) {
      console.warn('[context-engine] compact failed, falling back to compaction note:', compactResult.error)
      return this._fallbackCompact(messages, preparation, estimate.tokens)
    }

    const { summary, firstKeptEntryId, tokensBefore } = compactResult.value
    this.compressionCount++

    const firstKeptIndex = entries.findIndex((e) => e.id === firstKeptEntryId)
    if (firstKeptIndex < 0) {
      return messages
    }

    const summaryMessage = {
      role: 'user',
      content: `${SUMMARY_PREFIX}\n\n${summary}\n\n${SUMMARY_END_MARKER}`,
    }

    const tail = messages.slice(firstKeptIndex)
    return [summaryMessage, ...tail]
  }

  _fallbackCompact(messages, preparation, tokensBefore) {
    const entries = messagesToEntries(messages)
    const firstKeptEntryId = preparation.firstKeptEntryId
    const firstKeptIndex = entries.findIndex((e) => e.id === firstKeptEntryId)
    if (firstKeptIndex < 0) return messages

    const summaryMessage = {
      role: 'user',
      content: `${SUMMARY_PREFIX}\n\n${FALLBACK_COMPACTION_NOTE}\n\n${SUMMARY_END_MARKER}`,
    }
    return [summaryMessage, ...messages.slice(firstKeptIndex)]
  }
}

export function createDefaultEngine(model, options = {}) {
  const contextLength = resolveContextLength(model, options.contextLength || 200_000)
  return new ContextCompressor({
    contextLength,
    reserveTokens: options.reserveTokens,
    keepRecentTokens: options.keepRecentTokens,
    enabled: options.enabled,
  })
}
