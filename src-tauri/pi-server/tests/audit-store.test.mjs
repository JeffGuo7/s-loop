import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  appendAuditEvent,
  createToolAuditTracker,
  initAuditStore,
  listAuditEvents,
  verifyAuditTrail,
} from '../audit-store.mjs'
import {
  completeApproval,
  consumeApprovedApproval,
  createApprovalRequest,
  initApprovalStore,
  resolveApproval,
} from '../approval-store.mjs'

test('audit events are redacted, filterable, and hash chained', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snotra-audit-'))
  try {
    const file = initAuditStore(root)
    appendAuditEvent('approval.requested', {
      surface: 'task',
      surfaceId: 'task-1',
      runId: 'run-1',
      details: {
        command: 'npm test',
        Authorization: 'Bearer must-not-leak',
        nested: { apiKey: 'must-not-leak' },
      },
    })
    appendAuditEvent('approval.approved', {
      surface: 'goal',
      surfaceId: 'goal-1',
      runId: 'run-2',
      actor: 'local-user',
    })

    const verification = verifyAuditTrail()
    assert.equal(verification.valid, true)
    assert.equal(verification.count, 2)

    const taskEvents = listAuditEvents({ surface: 'task', runId: 'run-1' })
    assert.equal(taskEvents.length, 1)
    assert.equal(taskEvents[0].details.Authorization, '[REDACTED]')
    assert.equal(taskEvents[0].details.nested.apiKey, '[REDACTED]')
    assert.doesNotMatch(fs.readFileSync(file, 'utf-8'), /must-not-leak/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('audit verification detects a modified event', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snotra-audit-tamper-'))
  try {
    const file = initAuditStore(root)
    appendAuditEvent('approval.requested', {
      surface: 'platform',
      surfaceId: 'platform-run-1',
    })
    const original = fs.readFileSync(file, 'utf-8')
    fs.writeFileSync(file, original.replace('approval.requested', 'approval.approved'))

    const verification = verifyAuditTrail()
    assert.equal(verification.valid, false)
    assert.match(verification.error, /Hash mismatch/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('durable approval lifecycle emits linked audit events', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snotra-audit-approval-'))
  try {
    initAuditStore(root)
    initApprovalStore(root)
    const approval = createApprovalRequest({
      surface: 'task',
      surfaceId: 'task-audit',
      runId: 'run-audit',
      toolCallId: 'call-before-restart',
      toolName: 'bash',
      args: { command: 'npm test', env: { API_TOKEN: 'must-not-leak' } },
      risk: 'exec',
      source: 'builtin',
      matchedRule: 'mode:ask',
    })
    resolveApproval(approval.id, 'approve')
    consumeApprovedApproval(approval.id, {
      surface: 'task',
      surfaceId: 'task-audit',
      toolName: 'bash',
      args: { command: 'npm test', env: { API_TOKEN: 'must-not-leak' } },
      toolCallId: 'call-after-restart',
    })
    completeApproval(approval.id, 'completed')

    const events = listAuditEvents({ runId: 'run-audit' }).reverse()
    assert.deepEqual(events.map((event) => event.type), [
      'approval.requested',
      'approval.approved',
      'approval.execution_started',
      'approval.execution_completed',
    ])
    assert.ok(events.every((event) => event.approvalId === approval.id))
    assert.equal(verifyAuditTrail().valid, true)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('tool audit tracks policy and execution without persisting result content', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snotra-audit-tool-'))
  try {
    initAuditStore(root)
    const tracker = createToolAuditTracker({
      surface: 'goal',
      surfaceId: 'goal-tool',
      runId: 'run-tool',
    })
    const toolCall = {
      id: 'tool-call-1',
      name: 'bash',
      arguments: {
        command: 'npm test',
        env: { API_TOKEN: 'must-not-leak' },
      },
    }
    tracker.decision(toolCall, {
      outcome: 'allow',
      risk: 'exec',
      source: 'builtin',
      matchedRule: 'mode:allow',
      resolvedTargets: [],
      reason: 'Allowed by policy',
    })
    tracker.started(toolCall)
    tracker.finished(toolCall, {
      isError: false,
      content: [{ type: 'text', text: 'private tool output must not be audited' }],
    })

    const events = listAuditEvents({ runId: 'run-tool' }).reverse()
    assert.deepEqual(events.map((event) => event.type), [
      'tool.decision',
      'tool.execution_started',
      'tool.execution_completed',
    ])
    const raw = fs.readFileSync(path.join(root, 'audit', 'events.jsonl'), 'utf-8')
    assert.doesNotMatch(raw, /must-not-leak|private tool output/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
