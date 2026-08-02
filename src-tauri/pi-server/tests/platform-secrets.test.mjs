import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  getPlatformConfig,
  initPlatformCenter,
  updatePlatformConfig,
} from '../platform-center.mjs'

test('platform secrets remain available in memory but are redacted on disk', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 's-loop-platform-secrets-'))
  try {
    initPlatformCenter(root)
    updatePlatformConfig('telegram', {
      botToken: 'telegram-secret-token',
      chatId: '12345',
    })

    assert.equal(getPlatformConfig('telegram').values.botToken, 'telegram-secret-token')
    const persisted = fs.readFileSync(path.join(root, 'platforms', 'platforms.json'), 'utf8')
    assert.doesNotMatch(persisted, /telegram-secret-token/)
    assert.match(persisted, /12345/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
