import { createHash, randomUUID } from 'node:crypto'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from 'node:fs'
import { join } from 'node:path'

const GENESIS_HASH = '0'.repeat(64)
const SENSITIVE_KEY = /authorization|token|secret|password|passwd|api[-_]?key|cookie/i
let auditFile = ''
let lastHash = GENESIS_HASH

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
    )
  }
  return value
}

function redact(value, key = '') {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]'
  if (Array.isArray(value)) return value.map((item) => redact(item))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        redact(childValue, childKey),
      ]),
    )
  }
  return value
}

function eventHash(previousHash, event) {
  return createHash('sha256')
    .update(`${previousHash}\n${JSON.stringify(stableValue(event))}`)
    .digest('hex')
}

function toolFingerprint(toolCall) {
  return createHash('sha256')
    .update(JSON.stringify(stableValue({
      toolName: toolCall?.name || '',
      args: toolCall?.arguments || {},
    })))
    .digest('hex')
}

function readEvents() {
  if (!auditFile || !existsSync(auditFile)) return []
  return readFileSync(auditFile, 'utf-8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line)
      } catch {
        return { _parseError: true, _line: index + 1 }
      }
    })
}

export function verifyAuditTrail() {
  const events = readEvents()
  let previousHash = GENESIS_HASH
  for (let index = 0; index < events.length; index += 1) {
    const stored = events[index]
    if (stored._parseError) {
      return { valid: false, count: index, error: `Invalid JSON at line ${stored._line}` }
    }
    const { hash, previousHash: claimedPrevious, ...event } = stored
    if (claimedPrevious !== previousHash) {
      return { valid: false, count: index, error: `Broken chain at line ${index + 1}` }
    }
    const expected = eventHash(previousHash, event)
    if (hash !== expected) {
      return { valid: false, count: index, error: `Hash mismatch at line ${index + 1}` }
    }
    previousHash = hash
  }
  return { valid: true, count: events.length, lastHash: previousHash }
}

export function initAuditStore(baseDir) {
  const dir = join(baseDir, 'audit')
  mkdirSync(dir, { recursive: true })
  auditFile = join(dir, 'events.jsonl')
  const verification = verifyAuditTrail()
  if (!verification.valid) {
    throw new Error(`Audit trail verification failed: ${verification.error}`)
  }
  lastHash = verification.lastHash || GENESIS_HASH
  return auditFile
}

export function appendAuditEvent(type, data = {}) {
  if (!auditFile) return null
  const event = {
    id: randomUUID(),
    type,
    timestamp: Date.now(),
    surface: data.surface || 'system',
    surfaceId: data.surfaceId || undefined,
    runId: data.runId || undefined,
    approvalId: data.approvalId || undefined,
    toolCallId: data.toolCallId || undefined,
    toolName: data.toolName || undefined,
    fingerprint: data.fingerprint || undefined,
    actor: data.actor || 'system',
    outcome: data.outcome || undefined,
    details: redact(data.details || {}),
  }
  const hash = eventHash(lastHash, event)
  const stored = { ...event, previousHash: lastHash, hash }
  appendFileSync(auditFile, `${JSON.stringify(stored)}\n`, 'utf-8')
  lastHash = hash
  return stored
}

export function listAuditEvents({ limit = 200, surface, runId } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 1000))
  return readEvents()
    .filter((event) => !event._parseError)
    .filter((event) => !surface || event.surface === surface)
    .filter((event) => !runId || event.runId === runId)
    .slice(-safeLimit)
    .reverse()
}

export function createToolAuditTracker(contextProvider) {
  const started = new Map()
  const getContext = () => {
    const value = typeof contextProvider === 'function'
      ? contextProvider()
      : contextProvider
    return value || {}
  }
  const baseEvent = (toolCall) => {
    const context = getContext()
    return {
      surface: context.surface || 'session',
      surfaceId: context.surfaceId,
      runId: context.runId,
      toolCallId: toolCall?.id,
      toolName: toolCall?.name,
      fingerprint: toolFingerprint(toolCall),
      actor: context.actor || context.agentId || 'agent',
    }
  }

  return {
    decision(toolCall, decision) {
      return appendAuditEvent('tool.decision', {
        ...baseEvent(toolCall),
        outcome: decision.outcome,
        details: {
          risk: decision.risk,
          source: decision.source,
          matchedRule: decision.matchedRule,
          resolvedTargets: decision.resolvedTargets,
          reason: decision.reason,
          args: toolCall?.arguments || {},
        },
      })
    },

    started(toolCall) {
      const event = baseEvent(toolCall)
      const key = toolCall?.id || event.fingerprint
      started.set(key, event)
      return appendAuditEvent('tool.execution_started', {
        ...event,
        outcome: 'running',
      })
    },

    finished(toolCall, result) {
      const event = baseEvent(toolCall)
      const key = toolCall?.id || event.fingerprint
      if (!started.has(key)) return null
      started.delete(key)
      const failed = result?.isError === true
      return appendAuditEvent(
        failed ? 'tool.execution_failed' : 'tool.execution_completed',
        {
          ...event,
          outcome: failed ? 'failed' : 'completed',
        },
      )
    },
  }
}
