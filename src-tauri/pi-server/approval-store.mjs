import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

const SENSITIVE_KEY = /authorization|token|secret|password|passwd|api[-_]?key|cookie/i
const waiters = new Map()
let approvalsFile = ''

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
    )
  }
  return value
}

export function fingerprintToolCall(toolName, args = {}) {
  return createHash('sha256')
    .update(JSON.stringify({ toolName, args: stableValue(args) }))
    .digest('hex')
}

export function redactApprovalArguments(value, key = '') {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]'
  if (Array.isArray(value)) {
    return value.map((item) => redactApprovalArguments(item))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        redactApprovalArguments(childValue, childKey),
      ]),
    )
  }
  return value
}

function loadRaw() {
  if (!approvalsFile || !existsSync(approvalsFile)) return []
  try {
    const parsed = JSON.parse(readFileSync(approvalsFile, 'utf-8'))
    return Array.isArray(parsed) ? parsed : (parsed.approvals || [])
  } catch {
    return []
  }
}

function saveRaw(approvals) {
  if (!approvalsFile) throw new Error('Approval store is not initialized')
  const tempFile = `${approvalsFile}.tmp`
  writeFileSync(
    tempFile,
    JSON.stringify({ approvals, updatedAt: new Date().toISOString() }, null, 2),
    'utf-8',
  )
  renameSync(tempFile, approvalsFile)
}

function updateRecord(id, updater) {
  const approvals = loadRaw()
  const index = approvals.findIndex((record) => record.id === id)
  if (index < 0) return null
  approvals[index] = {
    ...approvals[index],
    ...updater(approvals[index]),
    updatedAt: Date.now(),
  }
  saveRaw(approvals)
  return approvals[index]
}

export function initApprovalStore(baseDir) {
  const approvalsDir = join(baseDir, 'approvals')
  mkdirSync(approvalsDir, { recursive: true })
  approvalsFile = join(approvalsDir, 'approvals.json')

  // A process restart makes an in-flight execution outcome unknowable. Keep it
  // visible, but never replay it automatically and risk duplicating a side effect.
  const approvals = loadRaw()
  let changed = false
  for (const record of approvals) {
    if (record.status === 'resuming') {
      record.status = 'interrupted'
      record.updatedAt = Date.now()
      record.reason = `${record.reason}; execution was interrupted during restart`
      changed = true
    }
  }
  if (changed) saveRaw(approvals)
  return approvalsFile
}

export function listApprovals({ status } = {}) {
  const approvals = loadRaw()
  const statuses = status
    ? new Set(Array.isArray(status) ? status : [status])
    : null
  return approvals
    .filter((record) => !statuses || statuses.has(record.status))
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function getApproval(id) {
  return loadRaw().find((record) => record.id === id) || null
}

export function createApprovalRequest(data) {
  const approvals = loadRaw()
  const fingerprint = fingerprintToolCall(data.toolName, data.args || {})
  const idempotencyKey = data.idempotencyKey
    || `${data.surface}:${data.surfaceId || ''}:${fingerprint}`
  const existing = approvals.find((record) =>
    record.idempotencyKey === idempotencyKey
    && (record.status === 'pending' || record.status === 'approved')
  )
  if (existing) return existing

  const now = Date.now()
  const record = {
    id: randomUUID(),
    status: 'pending',
    surface: data.surface || 'unknown',
    surfaceId: data.surfaceId || undefined,
    sessionId: data.sessionId || undefined,
    runId: data.runId || undefined,
    agentId: data.agentId || undefined,
    parentId: data.parentId || undefined,
    toolCallId: data.toolCallId || undefined,
    toolName: data.toolName || '',
    args: redactApprovalArguments(data.args || {}),
    fingerprint,
    reason: data.reason || 'Explicit approval required',
    risk: data.risk || 'external',
    source: data.source || 'extension',
    matchedRule: data.matchedRule || 'default',
    resolvedTargets: Array.isArray(data.resolvedTargets) ? data.resolvedTargets : [],
    idempotencyKey,
    createdAt: now,
    updatedAt: now,
    expiresAt: data.expiresAt || undefined,
  }
  approvals.push(record)
  saveRaw(approvals)
  return record
}

export function waitForApproval(id, { signal } = {}) {
  const record = getApproval(id)
  if (!record) return Promise.resolve(false)
  if (record.status === 'denied' || record.status === 'interrupted') {
    return Promise.resolve(false)
  }
  if (record.status === 'approved') {
    updateRecord(id, () => ({ status: 'resuming', resumedAt: Date.now() }))
    return Promise.resolve(true)
  }
  if (record.status !== 'pending') return Promise.resolve(record.status === 'resuming')

  return new Promise((resolve) => {
    const entries = waiters.get(id) || new Set()
    const waiter = { resolve, signal, onAbort: null }
    if (signal) {
      waiter.onAbort = () => {
        entries.delete(waiter)
        if (entries.size === 0) waiters.delete(id)
        resolve(false)
      }
      signal.addEventListener('abort', waiter.onAbort, { once: true })
    }
    entries.add(waiter)
    waiters.set(id, entries)
  })
}

export function resolveApproval(id, decision, decidedBy = 'local-user') {
  if (decision !== 'approve' && decision !== 'deny') {
    throw new Error('Decision must be approve or deny')
  }
  const current = getApproval(id)
  if (!current) return null
  if (current.status !== 'pending') {
    if (current.status === 'approved' && decision === 'deny') {
      const record = updateRecord(id, () => ({
        status: 'denied',
        decision,
        decidedBy,
        decidedAt: Date.now(),
      }))
      return { record, delivered: false, changed: true }
    }
    return { record: current, delivered: false, changed: false }
  }

  const entries = waiters.get(id)
  const delivered = Boolean(entries?.size)
  const status = decision === 'approve'
    ? (delivered ? 'resuming' : 'approved')
    : 'denied'
  const record = updateRecord(id, () => ({
    status,
    decision,
    decidedBy,
    decidedAt: Date.now(),
    ...(delivered && decision === 'approve' ? { resumedAt: Date.now() } : {}),
  }))

  if (entries) {
    waiters.delete(id)
    for (const waiter of entries) {
      if (waiter.signal && waiter.onAbort) {
        waiter.signal.removeEventListener('abort', waiter.onAbort)
      }
      waiter.resolve(decision === 'approve')
    }
  }
  return { record, delivered, changed: true }
}

export function consumeApprovedApproval(id, expected = {}) {
  const record = getApproval(id)
  if (!record || record.status !== 'approved') return null
  if (expected.surface && record.surface !== expected.surface) return null
  if (expected.surfaceId && record.surfaceId !== expected.surfaceId) return null
  const fingerprint = fingerprintToolCall(expected.toolName, expected.args || {})
  if (record.fingerprint !== fingerprint) return null
  return updateRecord(id, () => ({
    status: 'resuming',
    resumedAt: Date.now(),
    resumedToolCallId: expected.toolCallId,
  }))
}

export function completeApproval(id, executionStatus = 'completed') {
  return updateRecord(id, () => ({
    status: executionStatus === 'completed' ? 'completed' : 'failed',
    executionStatus,
    completedAt: Date.now(),
  }))
}
