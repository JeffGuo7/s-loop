/**
 * Platform adapter base — shared utilities and the adapter interface contract.
 *
 * Each platform adapter is a plain object implementing a subset of:
 *
 *   {
 *     id: string,                 // 'telegram' | 'feishu' | ...
 *     inboundMode: 'polling' | 'webhook' | 'none',
 *
 *     // Connection validation (called on "Connect"). Throws on failure.
 *     async validateConnection(platform): Promise<void>,
 *
 *     // Send an outbound message. Throws on failure.
 *     async dispatch(platform, text, options): Promise<void>,
 *
 *     // Webhook platforms only — verify inbound authenticity.
 *     // Returns { ok: true } or { ok: false, error }.
 *     verifyInbound(rawBody, payload, headers, platform): { ok, error? },
 *
 *     // Webhook platforms only — normalize a raw payload into a common shape:
 *     //   { platformId, conversationId, chatId, threadId, messageId, text, username }
 *     // Return null to ignore, or { challenge } for handshake echoes.
 *     normalizeInbound(payload): object | null,
 *   }
 *
 * `platform` is the stored config object: { id, name, values: {...}, fields, ... }
 */
import { timingSafeEqual } from 'node:crypto'

/** Constant-time string comparison to avoid timing attacks on token checks. */
export function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8')
  const b = Buffer.from(String(right || ''), 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** POST JSON and parse the response, throwing a useful error on non-2xx. */
export async function postJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    throw new Error(
      typeof data === 'string'
        ? data
        : data?.description || data?.errmsg || data?.msg || `HTTP ${res.status}`,
    )
  }
  return data
}

/** Validate that a config value parses as a URL, throwing a labeled error. */
export function assertUrl(value, label) {
  try {
    return new URL(value)
  } catch {
    throw new Error(`${label} 格式无效`)
  }
}
