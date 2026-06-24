/**
 * Retry logic for LLM API calls — adapted from cc-haha-main's withRetry pattern.
 *
 * Key design decisions:
 * - Exponential backoff: 1s * 2^attempt + 25% jitter, capped at 30s
 * - Max 5 retries for transient errors (network, 5xx, rate-limit)
 * - AbortSignal-aware: user-triggered abort exits immediately
 * - Async generator: yields status updates during wait so UI can show progress
 */

const BASE_DELAY_MS = 1000
const MAX_RETRIES = 5
const MAX_DELAY_MS = 30_000

/**
 * Determine whether an error is transient and worth retrying.
 * Handles both pi-agent-core error shapes and raw HTTP errors.
 */
function shouldRetry(error) {
  if (!error) return false

  const msg = (error.message || '').toLowerCase()

  // Network-level errors — always transient
  if (msg.includes('econnreset')) return true
  if (msg.includes('epipe')) return true
  if (msg.includes('etimedout')) return true
  if (msg.includes('econnrefused')) return true
  if (msg.includes('enotfound')) return true
  if (msg.includes('eagain')) return true
  if (msg.includes('socket hang up')) return true
  if (msg.includes('request was aborted')) return true
  if (msg.includes('fetch failed')) return true
  if (msg.includes('network error')) return true
  if (msg.includes('timeout')) return true
  if (msg.includes('aborted')) return true

  // HTTP status codes
  const status = error.status || error.statusCode
  if (status >= 500 && status < 600) return true // Server errors
  if (status === 429) return true // Rate limit — respect Retry-After if present
  if (status === 408) return true // Request timeout
  if (status === 409) return true // Conflict

  // Overloaded (Anthropic-specific)
  if (msg.includes('overloaded')) return true

  return false
}

/**
 * Calculate delay with exponential backoff + jitter.
 * Respects Retry-After header when available.
 */
function getRetryDelay(attempt, retryAfterHeader) {
  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10)
    if (!isNaN(seconds) && seconds > 0) {
      return seconds * 1000
    }
  }

  const base = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS)
  const jitter = Math.random() * 0.25 * base
  return base + jitter
}

/**
 * Extract Retry-After value from error headers (if present).
 */
function getRetryAfter(error) {
  if (!error || !error.headers) return null
  // Headers can be a plain object or a Map/Headers instance
  if (typeof error.headers.get === 'function') {
    return error.headers.get('retry-after')
  }
  return error.headers['retry-after'] || error.headers['Retry-After'] || null
}

/**
 * Abort-aware sleep. Resolves early if signal fires (user cancelled).
 */
function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      resolve()
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Retry an async operation with exponential backoff.
 *
 * @param {() => Promise<T>} operation - The async function to retry
 * @param {object} options
 * @param {number} [options.maxRetries=5]
 * @param {AbortSignal} [options.signal] - User-triggered abort
 * @param {(status: object) => void} [options.onRetry] - Called before each retry wait
 * @returns {Promise<T>}
 *
 * `onRetry` receives: { attempt, maxRetries, delayMs, error: string, waitUntil: number }
 */
export async function withRetry(operation, options = {}) {
  const {
    maxRetries = MAX_RETRIES,
    signal,
    onRetry,
  } = options

  let lastError

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    if (signal?.aborted) {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' })
    }

    try {
      return await operation()
    } catch (error) {
      lastError = error

      if (!shouldRetry(error) || attempt > maxRetries) {
        throw error
      }

      const retryAfter = getRetryAfter(error)
      const delayMs = getRetryDelay(attempt, retryAfter)

      if (onRetry) {
        onRetry({
          attempt,
          maxRetries,
          delayMs,
          error: error.message || String(error),
          waitUntil: Date.now() + delayMs,
        })
      }

      await sleep(delayMs, signal)
    }
  }

  throw lastError
}
