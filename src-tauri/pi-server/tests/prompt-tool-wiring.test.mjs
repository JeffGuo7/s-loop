// The first prompt in a session creates the tool bundle before the agent
// exists. The same bundle feeds wrapper.config.mcpToolNames, so the new-agent
// branch must bind both names. A missing `baseTools` binding throws inside the
// request handler and turns every first message into "Error: baseTools is not
// defined" — a regression that route smoke tests do not reach.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

test('new-session prompt branch binds baseTools for mcpToolNames', () => {
  const source = fs.readFileSync(fileURLToPath(new URL('../index.mjs', import.meta.url)), 'utf8')
  assert.match(
    source,
    /if \(!wrapper\.agent\) \{\s*const \{ baseTools, tools \} = createChatToolBundle\(\{/,
  )
})

test('sidecar never writes the read-only AgentState.systemPrompt', () => {
  const source = fs.readFileSync(fileURLToPath(new URL('../index.mjs', import.meta.url)), 'utf8')
  assert.doesNotMatch(source, /\.state\.systemPrompt\s*=/)
})
