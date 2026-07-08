/**
 * Platform access control — whitelist-first authorization + rate limiting.
 *
 * Policy (whitelist-first, the configured default):
 *   - allowedUsers non-empty  → only listed identities may trigger the AI
 *   - allowedUsers empty + allowAll on  → open, but still rate-limited
 *   - allowedUsers empty + allowAll off → deny (owner must configure first)
 *
 * Rate limiting always applies as a safety net, even to whitelisted users,
 * so a compromised/spamming allowed account can't flood the agent.
 */

const RATE_WINDOW_MS = 60_000
const DEFAULT_RATE_LIMIT = 10

// key → array of request timestamps within the current window
const _buckets = new Map()

/** Split a comma/newline separated list into trimmed, non-empty tokens. */
function parseList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean)
  if (typeof value !== 'string') return []
  return value.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
}

/** Candidate identities an inbound message can be matched against. */
function identitiesOf(incoming) {
  return [incoming.username, incoming.fromId, incoming.chatId, incoming.conversationId]
    .map((v) => (v == null ? '' : String(v).trim()))
    .filter(Boolean)
}

/**
 * Check whether an inbound message is allowed to trigger the AI.
 * Returns { ok: true } or { ok: false, reason }.
 */
export function checkAccess(platform, incoming) {
  const values = platform?.values || {}
  const allowed = parseList(values.allowedUsers)
  const allowAll = values.allowAll === true || values.allowAll === 'true'

  if (allowed.length > 0) {
    const ids = identitiesOf(incoming)
    const match = ids.some((id) => allowed.includes(id))
    return match ? { ok: true } : { ok: false, reason: 'not_whitelisted' }
  }

  if (allowAll) return { ok: true }
  return { ok: false, reason: 'no_whitelist' }
}

/**
 * Sliding-window rate limit. Returns true if the request is allowed,
 * false if it exceeds the per-identity limit for this platform.
 */
export function checkRateLimit(platform, incoming) {
  const values = platform?.values || {}
  const limit = Math.max(1, parseInt(values.rateLimit, 10) || DEFAULT_RATE_LIMIT)
  const identity = identitiesOf(incoming)[0] || 'anon'
  const key = `${platform.id}:${identity}`

  const now = Date.now()
  const recent = (_buckets.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS)
  if (recent.length >= limit) {
    _buckets.set(key, recent)
    return false
  }
  recent.push(now)
  _buckets.set(key, recent)
  return true
}

/** Combined gate: access + rate limit. Returns { ok, reason? }. */
export function authorizeInbound(platform, incoming) {
  const access = checkAccess(platform, incoming)
  if (!access.ok) return access
  if (!checkRateLimit(platform, incoming)) {
    return { ok: false, reason: 'rate_limited' }
  }
  return { ok: true }
}
