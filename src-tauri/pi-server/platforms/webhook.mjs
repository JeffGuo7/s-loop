/**
 * Generic webhook adapter. Outbound only — POSTs a JSON envelope,
 * optionally HMAC-SHA256 signed with the configured secret.
 */
import { createHmac } from 'node:crypto'
import { postJson, assertUrl } from './base.mjs'

export default {
  id: 'webhook',
  inboundMode: 'none',
  // Webhook payloads are machine-consumed — preserve the raw markdown
  // rather than flattening it to plain text.
  formatMessage: (text) => text,

  async validateConnection(platform) {
    assertUrl(platform.values.url?.trim(), 'Webhook URL')
  },

  async dispatch(platform, text) {
    const body = {
      text,
      source: 's-loop',
      platformId: platform.id,
      timestamp: new Date().toISOString(),
    }
    const headers = {}
    const secret = platform.values.secret?.trim()
    if (secret) {
      headers['X-S-Loop-Signature'] = createHmac('sha256', secret)
        .update(JSON.stringify(body))
        .digest('hex')
    }
    await postJson(platform.values.url.trim(), body, headers)
  },
}
