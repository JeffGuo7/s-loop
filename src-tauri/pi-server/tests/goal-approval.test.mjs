import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  createApprovalRequest,
  getApproval,
  initApprovalStore,
  resolveApproval,
} from '../approval-store.mjs'
import { createGoalApprovalCoordinator } from '../goal-loop/approval.mjs'

const decision = {
  reason: 'bash requires explicit approval',
  risk: 'exec',
  source: 'builtin',
  matchedRule: 'mode:ask',
  resolvedTargets: [],
}

test('goal approval parks, resumes, and completes the exact live tool call', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snotra-goal-approval-'))
  try {
    initApprovalStore(root)
    const goalState = {
      id: 'goal-live',
      status: 'running',
      steps: [],
    }
    const persisted = []
    const coordinator = createGoalApprovalCoordinator({
      goalState,
      runId: 'run-live',
      persistFn: (state) => persisted.push({ ...state }),
    })

    const toolCall = {
      id: 'call-live',
      name: 'bash',
      arguments: { command: 'npm test' },
    }
    const pending = coordinator.request(toolCall, decision)
    const waiting = persisted.at(-1)
    assert.equal(waiting.status, 'waiting_for_approval')
    assert.ok(waiting.pendingApprovalId)

    const resolved = resolveApproval(waiting.pendingApprovalId, 'approve')
    assert.equal(resolved.delivered, true)
    assert.equal(await pending, undefined)
    assert.equal(goalState.status, 'running')
    assert.equal(goalState.pendingApprovalId, undefined)

    coordinator.complete(toolCall, { isError: false })
    assert.equal(getApproval(waiting.pendingApprovalId).status, 'completed')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('goal approval consumes a post-restart grant only for the matching call', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snotra-goal-resume-'))
  try {
    initApprovalStore(root)
    const approval = createApprovalRequest({
      surface: 'goal',
      surfaceId: 'goal-resume',
      runId: 'run-resume',
      toolCallId: 'old-call',
      toolName: 'bash',
      args: { command: 'npm test' },
      ...decision,
    })
    const resolved = resolveApproval(approval.id, 'approve')
    assert.equal(resolved.record.status, 'approved')

    const goalState = {
      id: 'goal-resume',
      status: 'waiting_for_approval',
      pendingApprovalId: approval.id,
      steps: [],
    }
    const coordinator = createGoalApprovalCoordinator({
      goalState,
      runId: 'run-resume',
      resumeApprovalId: approval.id,
    })
    const replayedCall = {
      id: 'new-call',
      name: 'bash',
      arguments: { command: 'npm test' },
    }

    assert.equal(await coordinator.request(replayedCall, decision), undefined)
    assert.equal(getApproval(approval.id).status, 'resuming')
    assert.equal(getApproval(approval.id).resumedToolCallId, 'new-call')

    coordinator.complete(replayedCall, { isError: true })
    assert.equal(getApproval(approval.id).status, 'failed')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
