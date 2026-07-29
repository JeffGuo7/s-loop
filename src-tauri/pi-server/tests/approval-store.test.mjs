import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  completeApproval,
  consumeApprovedApproval,
  createApprovalRequest,
  getApproval,
  initApprovalStore,
  listApprovals,
  resolveApproval,
  waitForApproval,
} from '../approval-store.mjs'

test('approval requests persist, redact secrets, and resume a live waiter', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snotra-approvals-'))
  try {
    initApprovalStore(root)
    const request = createApprovalRequest({
      surface: 'task',
      surfaceId: 'task-1',
      toolCallId: 'call-1',
      toolName: 'write',
      args: { path: 'report.md', apiKey: 'secret' },
      risk: 'write-local',
    })
    assert.equal(request.status, 'pending')
    assert.equal(request.args.apiKey, '[REDACTED]')

    const waiting = waitForApproval(request.id)
    const result = resolveApproval(request.id, 'approve')
    assert.equal(result.delivered, true)
    assert.equal(await waiting, true)
    assert.equal(getApproval(request.id).status, 'resuming')

    completeApproval(request.id)
    assert.equal(getApproval(request.id).status, 'completed')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('an approval survives restart and can be consumed only by the exact call', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snotra-approvals-'))
  try {
    initApprovalStore(root)
    const request = createApprovalRequest({
      surface: 'task',
      surfaceId: 'task-2',
      toolName: 'bash',
      args: { command: 'git status' },
      risk: 'exec',
    })

    initApprovalStore(root)
    assert.equal(listApprovals({ status: 'pending' }).length, 1)
    const result = resolveApproval(request.id, 'approve')
    assert.equal(result.delivered, false)
    assert.equal(getApproval(request.id).status, 'approved')

    assert.equal(consumeApprovedApproval(request.id, {
      surface: 'task',
      surfaceId: 'task-2',
      toolName: 'bash',
      args: { command: 'git diff' },
    }), null)
    assert.ok(consumeApprovedApproval(request.id, {
      surface: 'task',
      surfaceId: 'task-2',
      toolName: 'bash',
      args: { command: 'git status' },
      toolCallId: 'resumed-call',
    }))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('denied approvals release waiters without executing', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snotra-approvals-'))
  try {
    initApprovalStore(root)
    const request = createApprovalRequest({
      surface: 'goal',
      surfaceId: 'goal-1',
      toolName: 'run_subagent',
      args: { agent: 'coder' },
    })
    const waiting = waitForApproval(request.id)
    resolveApproval(request.id, 'deny')
    assert.equal(await waiting, false)
    assert.equal(getApproval(request.id).status, 'denied')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
