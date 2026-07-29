import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  createPlatformRun,
  getPlatformRun,
  initPlatformRunStore,
  updatePlatformRun,
} from '../platform-run-store.mjs'

test('platform runs deduplicate inbound messages and preserve approval waits', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snotra-platform-run-'))
  try {
    initPlatformRunStore(root)
    const input = {
      platformId: 'telegram',
      sessionId: 'telegram_chat-1',
      incoming: {
        messageId: 'message-1',
        conversationId: 'chat-1',
        chatId: 'chat-1',
        text: 'run the report',
      },
      sendOptions: { chatId: 'chat-1', replyToMessageId: 'message-1' },
    }
    const created = createPlatformRun(input)
    const duplicate = createPlatformRun(input)
    assert.equal(duplicate.id, created.id)

    updatePlatformRun(created.id, {
      status: 'waiting_for_approval',
      pendingApprovalId: 'approval-1',
    })
    initPlatformRunStore(root)
    assert.equal(getPlatformRun(created.id).status, 'waiting_for_approval')
    assert.equal(getPlatformRun(created.id).pendingApprovalId, 'approval-1')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('platform runs never auto-replay execution interrupted by restart', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snotra-platform-interrupt-'))
  try {
    initPlatformRunStore(root)
    const created = createPlatformRun({
      platformId: 'feishu',
      sessionId: 'feishu_chat-2',
      incoming: {
        messageId: 'message-2',
        conversationId: 'chat-2',
        text: 'write a file',
      },
    })
    updatePlatformRun(created.id, { status: 'resuming' })

    initPlatformRunStore(root)
    const interrupted = getPlatformRun(created.id)
    assert.equal(interrupted.status, 'interrupted')
    assert.match(interrupted.error, /restart/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
