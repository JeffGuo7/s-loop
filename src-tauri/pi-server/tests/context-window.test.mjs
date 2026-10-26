import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveContextLength } from '../context-engine/token-utils.mjs'
import { createDefaultEngine } from '../context-engine/compressor.mjs'

test('prefers the pi 1.4 contextWindow field over model-family guesses', () => {
  assert.equal(
    resolveContextLength({ id: 'deepseek-v4.1-flash', contextWindow: 1_000_000 }),
    1_000_000,
  )
  assert.equal(
    resolveContextLength({ id: 'deepseek-v4.1-flash', contextLength: 128_000 }),
    128_000,
  )
})

test('does not compact a 1M-token model at 137k tokens', () => {
  const engine = createDefaultEngine({
    id: 'deepseek-v4.1-flash',
    contextWindow: 1_000_000,
  })

  assert.equal(engine.contextLength, 1_000_000)
  assert.equal(engine.shouldCompress(137_430), false)
  assert.equal(engine.shouldCompress(950_000), true)
})
