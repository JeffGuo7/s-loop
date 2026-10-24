// Context compression engine using pi-coding-agent 1.4 compaction utilities.

import {
  calculateContextTokens,
  estimateTokens,
  shouldCompact,
  DEFAULT_COMPACTION_SETTINGS,
  compact,
  generateBranchSummary,
  findCutPoint,
  buildSessionProjection,
} from '@earendil-works/pi-coding-agent'
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

function estimateContextTokens(messages) {
  return { tokens: messages.reduce((sum, m) => sum + estimateTokens(m), 0) }
}

/** pi-coding-agent 1.4 no longer exports prepareCompaction; rebuild the part
 *  of it that applies to S-Loop's inputs — a plain message chain with no
 *  compaction entries inside, so the projection maps 1:1 to the entries. */
function prepareCompaction(pathEntries, settings) {
  if (pathEntries.length > 0 && pathEntries[pathEntries.length - 1].type === 'compaction') {
    return undefined
  }
  const projectedMessages = buildSessionProjection(pathEntries).messages
  if (projectedMessages.length === 0) return undefined
  const tokensBefore = projectedMessages.reduce((sum, m) => sum + estimateTokens(m), 0)
  const cutPoint = findCutPoint(pathEntries, 0, pathEntries.length, settings.keepRecentTokens)
  const firstKeptEntry = pathEntries[cutPoint.firstKeptEntryIndex]
  if (!firstKeptEntry?.id) return undefined
  const historyEnd = cutPoint.isSplitTurn ? cutPoint.turnStartIndex : cutPoint.firstKeptEntryIndex
  const messagesToSummarize = pathEntries
    .slice(0, historyEnd)
    .flatMap((e) => (e.type === 'message' ? [e.message] : []))
  if (messagesToSummarize.length === 0) return undefined
  return {
    firstKeptEntryId: firstKeptEntry.id,
    messagesToSummarize,
    turnPrefixMessages: [],
    isSplitTurn: cutPoint.isSplitTurn,
    tokensBefore,
    fileOps: { read: new Set(), written: new Set(), edited: new Set() },
    settings,
  }
}

export class ContextEngine {
  constructor(options = {}) {
    this.contextLength = options.contextLength || 200_000
    // Scale reserve tokens with context: ~8% for response buffer,
    // but at least 16K and at most 80K.
    const scaledReserve = Math.min(Math.max(16384, Math.floor(this.contextLength * 0.08)), 80000)
    // Keep more recent chat for larger models: ~10% or at least 20K
    const scaledKeep = Math.max(20000, Math.floor(this.contextLength * 0.1))
    this.settings = {
      enabled: options.enabled ?? true,
      reserveTokens: options.reserveTokens ?? scaledReserve,
      keepRecentTokens: options.keepRecentTokens ?? scaledKeep,
    }
    this.lastTotalTokens = options.lastTotalTokens || 0
    this.compressionCount = options.compressionCount || 0
    this.lastCompression = null
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
    // 1.4 returns the preparation directly (undefined when nothing to compact).
    const preparation = prepareCompaction(entries, this.settings)
    if (!preparation) {
      return messages
    }

    // 1.4's compact() takes the apiKey directly — no models-registry adapter.
    let compactResult
    try {
      compactResult = await compact(
        preparation,
        model,
        apiKey,
        undefined,
        IDENTIFIER_PRESERVATION_INSTRUCTIONS,
        signal,
      )
    } catch (err) {
      console.warn('[context-engine] compact failed, falling back to compaction note:', err)
      return this._fallbackCompact(messages, preparation, estimate.tokens, onStatus)
    }

    if (!compactResult?.summary) {
      console.warn('[context-engine] compact failed, falling back to compaction note:', compactResult?.error)
      return this._fallbackCompact(messages, preparation, estimate.tokens, onStatus)
    }

    const { summary, firstKeptEntryId, tokensBefore } = compactResult
    const firstKeptIndex = entries.findIndex((e) => e.id === firstKeptEntryId)
    if (firstKeptIndex < 0) {
      return messages
    }
    this.compressionCount++

    // Try branch-aware summarization on the compacted section for richer context.
    // This gives the model a structured view of tools/delegates/branches that
    // were active before compaction, in addition to the flat summary.
    let branchSummary = ''
    const keptEntries = entries.slice(0, firstKeptIndex)
    if (keptEntries.length > 2) {
      try {
        const branchResult = await generateBranchSummary(keptEntries, {
          model,
          apiKey,
          signal: signal || new AbortController().signal,
        })
        if (typeof branchResult?.summary === 'string' && branchResult.summary) {
          branchSummary = `\n\n## Branch Activity\n\n${branchResult.summary}`
        }
      } catch {
        // Branch summary is best-effort; fall back to flat summary only.
      }
    }

    const summaryMessage = {
      role: 'user',
      content: `${SUMMARY_PREFIX}\n\n${summary}${branchSummary}\n\n${SUMMARY_END_MARKER}`,
    }

    const tail = messages.slice(firstKeptIndex)
    const compressedMessages = [summaryMessage, ...tail]
    this._recordCompression(compressedMessages, tokensBefore || estimate.tokens, onStatus, false)
    return compressedMessages
  }

  _recordCompression(messages, tokensBefore, onStatus, fallback) {
    const tokensAfter = estimateContextTokens(messages).tokens
    this.lastTotalTokens = tokensAfter
    this.lastCompression = {
      compressionCount: this.compressionCount,
      tokensBefore,
      tokensAfter,
      fallback,
      createdAt: Date.now(),
    }
    onStatus?.({
      type: 'compacted',
      message: fallback ? 'Context compacted with a fallback checkpoint.' : 'Context compacted.',
      ...this.lastCompression,
    })
  }

  _fallbackCompact(messages, preparation, tokensBefore, onStatus) {
    const entries = messagesToEntries(messages)
    const firstKeptEntryId = preparation.firstKeptEntryId
    const firstKeptIndex = entries.findIndex((e) => e.id === firstKeptEntryId)
    if (firstKeptIndex < 0) return messages

    const summaryMessage = {
      role: 'user',
      content: `${SUMMARY_PREFIX}\n\n${FALLBACK_COMPACTION_NOTE}\n\n${SUMMARY_END_MARKER}`,
    }
    const compressedMessages = [summaryMessage, ...messages.slice(firstKeptIndex)]
    this.compressionCount++
    this._recordCompression(compressedMessages, tokensBefore, onStatus, true)
    return compressedMessages
  }
}

export function createDefaultEngine(model, options = {}) {
  const contextLength = resolveContextLength(model, options.contextLength || 200_000)
  return new ContextCompressor({
    contextLength,
    reserveTokens: options.reserveTokens,
    keepRecentTokens: options.keepRecentTokens,
    enabled: options.enabled,
    compressionCount: options.compressionCount,
    lastTotalTokens: options.lastTotalTokens,
  })
}
