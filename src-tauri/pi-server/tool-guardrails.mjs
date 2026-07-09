/**
 * Tool guardrails — prevent the AI from getting stuck in tool-loops.
 *
 * Two layers of protection:
 *   Layer 1 (warn): After N consecutive failures of the same tool, inject a
 *     cautionary note into the tool result so the model knows it's stuck.
 *   Layer 2 (block): After M failures, replace the result with a hard stop
 *     telling the model to change its approach entirely.
 *
 * Thresholds are per-session and reset when a tool succeeds.
 *
 * Usage: Create one Guard instance per Agent session in afterToolCall.
 */

// ── Config ──────────────────────────────────────────────────────────

const PRESSURE_MESSAGES = {
  2: '\n\n[NOTE: This tool has failed 2 times in a row. Check the error and try a different approach.]',
  3: '\n\n[NOTE: This tool has failed 3 times. Consider diagnosing the root cause before retrying.]',
  4: '\n\n[WARNING: This tool has failed 4 times. You MUST NOT call it again until you understand why.]',
}

const HARD_BLOCK_MESSAGE =
  '\n\n[ERROR: This tool has failed 5 times consecutively. ' +
  'STOP calling this tool. Try a COMPLETELY different approach or ask the user for help.]'

// ── Guard class ─────────────────────────────────────────────────────

export class ToolGuard {
  /** Map of toolName → { consecutiveFailures, lastArgs } */
  #failures = new Map()

  /** Expose current failure state for the approval dialog to show. */
  getFailures() {
    return new Map(this.#failures)
  }

  /**
   * Called BEFORE a tool executes. Returns an injected warning if the
   * model is about to retry a tool that has already been failing.
   * Returns null if everything is fine.
   */
  beforeTool(toolName, args) {
    const record = this.#failures.get(toolName)
    if (!record || record.consecutiveFailures < 2) return null

    const argsKey = JSON.stringify(args)
    const sameArgs = record.lastArgs === argsKey
    const n = record.consecutiveFailures

    // Layer 2: hard block after 5 consecutive failures
    if (sameArgs && n >= 5) {
      return {
        block: true,
        reason: `Tool "${toolName}" has failed ${n} consecutive times with the same arguments. Call a different tool.`,
      }
    }

    return null
  }

  /**
   * Called AFTER a tool executes. Tracks the outcome and returns
   * an optional suffix to append to the result text.
   *   - On success: clears the failure counter and returns ''.
   *   - On failure: increments the counter and returns a warning/block message.
   */
  afterTool(toolName, args, isError) {
    const argsKey = JSON.stringify(args)
    const record = this.#failures.get(toolName)

    if (!isError) {
      // Success resets the counter
      if (record) this.#failures.delete(toolName)
      return ''
    }

    // Failure — track it
    const consecutiveFailures = (record?.consecutiveFailures || 0) + 1
    this.#failures.set(toolName, { consecutiveFailures, lastArgs: argsKey })

    if (consecutiveFailures >= 5) {
      return HARD_BLOCK_MESSAGE
    }

    const msg = PRESSURE_MESSAGES[consecutiveFailures]
    return msg || ''
  }

  /** Clear all tracking for this session. */
  reset() {
    this.#failures.clear()
  }
}
