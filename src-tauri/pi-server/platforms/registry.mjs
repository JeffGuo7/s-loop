/**
 * Platform adapter registry. Single source of truth mapping a platformId
 * to its adapter. Adding a new platform = create one adapter file and
 * register it here — no changes to index.mjs or platform-center.mjs.
 */
import telegram from './telegram.mjs'
import email from './email.mjs'
import webhook from './webhook.mjs'
import feishu from './feishu.mjs'
import dingtalk from './dingtalk.mjs'
import wechat from './wechat.mjs'

const ADAPTERS = new Map(
  [telegram, email, webhook, feishu, dingtalk, wechat].map((a) => [a.id, a]),
)

/** Get an adapter by platform id, or throw if unknown. */
export function getAdapter(platformId) {
  const adapter = ADAPTERS.get(platformId)
  if (!adapter) throw new Error(`Unsupported platform: ${platformId}`)
  return adapter
}

/** Get an adapter or undefined (no throw). */
export function tryGetAdapter(platformId) {
  return ADAPTERS.get(platformId)
}

/** List all registered platform ids. */
export function listAdapterIds() {
  return [...ADAPTERS.keys()]
}

/** Ids of platforms that receive inbound messages via webhook. */
export function webhookPlatformIds() {
  return [...ADAPTERS.values()].filter((a) => a.inboundMode === 'webhook').map((a) => a.id)
}
