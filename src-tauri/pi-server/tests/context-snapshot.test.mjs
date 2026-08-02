import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  createContextSnapshot,
  deleteContextSnapshot,
  loadContextSnapshot,
  restoreContextFromSnapshot,
  saveContextSnapshot,
} from '../context-engine/snapshot-store.mjs'

test('context snapshot survives restart and restores only the uncovered tail', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 's-loop-context-snapshot-'))
  const sessionId = '../unsafe/session-id'
  try {
    const summary = { role: 'user', content: '[summary]' }
    const snapshot = createContextSnapshot({
      sourceMessageCount: 2,
      messages: [summary],
      compressionCount: 1,
      tokensBefore: 1000,
      tokensAfter: 200,
    })
    await saveContextSnapshot(root, sessionId, snapshot)

    const loaded = await loadContextSnapshot(root, sessionId)
    assert.equal(loaded.compressionCount, 1)
    assert.deepEqual(
      restoreContextFromSnapshot(
        [
          { role: 'user', content: 'old' },
          { role: 'assistant', content: 'old reply' },
          { role: 'user', content: 'new tail' },
        ],
        loaded,
      ),
      [summary, { role: 'user', content: 'new tail' }],
    )

    await deleteContextSnapshot(root, sessionId)
    assert.equal(await loadContextSnapshot(root, sessionId), null)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('invalid context snapshots never discard full history', () => {
  const full = [{ role: 'user', content: 'keep me' }]
  assert.equal(restoreContextFromSnapshot(full, null), full)
  assert.equal(restoreContextFromSnapshot(full, {
    version: 1,
    sourceMessageCount: 99,
    messages: [],
  }), full)
})
