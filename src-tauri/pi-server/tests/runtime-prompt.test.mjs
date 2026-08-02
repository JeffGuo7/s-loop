import assert from 'node:assert/strict'
import test from 'node:test'

import { assembleRuntimeSystemPrompt } from '../runtime-prompt.mjs'

test('runtime surfaces retain the active agent profile and skills', () => {
  const prompt = assembleRuntimeSystemPrompt({
    agentSystemPrompt: '## Soul\nBe grounded.',
    agentSkillsBlock: '## Active Skills\nUse the reviewer skill.',
    surfacePrompt: '## Goal Runtime\nComplete the active goal.',
  })

  assert.match(prompt, /## Soul/)
  assert.match(prompt, /## Active Skills/)
  assert.match(prompt, /## Goal Runtime/)
  assert.ok(prompt.indexOf('## Soul') < prompt.indexOf('## Goal Runtime'))
})

test('runtime surfaces use a safe fallback without an active profile', () => {
  assert.equal(
    assembleRuntimeSystemPrompt({ fallbackPrompt: 'fallback' }),
    'fallback',
  )
})
