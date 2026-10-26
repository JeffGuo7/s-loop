import test from 'node:test'
import assert from 'node:assert/strict'
import { Agent } from '@earendil-works/pi-agent-core'
import { setAgentSystemPrompt } from '../agent-state.mjs'

const streamFn = async function* () {}

test('replaces the read-only system prompt without throwing', () => {
  const userMessage = { role: 'user', content: 'hello', timestamp: 1 }
  const agent = new Agent({
    initialState: { systemPrompt: 'old prompt', messages: [userMessage] },
    streamFn,
  })

  assert.equal(agent.state.systemPrompt, 'old prompt')
  setAgentSystemPrompt(agent, 'new prompt', [])

  assert.equal(agent.state.systemPrompt, 'new prompt')
  assert.deepEqual(
    agent.state.messages.filter((message) => message.role === 'user'),
    [userMessage],
  )
})

test('keeps current tool declarations in the rebuilt system message', () => {
  const agent = new Agent({ initialState: { systemPrompt: 'old' }, streamFn })
  const tool = {
    name: 'echo',
    description: 'Echo text',
    parameters: { type: 'object', properties: {} },
    execute: async () => ({ content: [] }),
  }

  setAgentSystemPrompt(agent, 'with tools', [tool])

  assert.equal(agent.state.systemPrompt, 'with tools')
  assert.equal(agent.state.messages[0].toolsAdded?.[0]?.name, 'echo')
})

test('is a no-op when the prompt is unchanged', () => {
  const agent = new Agent({ initialState: { systemPrompt: 'same' }, streamFn })
  const before = agent.state.messages

  setAgentSystemPrompt(agent, 'same', [])

  assert.equal(agent.state.messages, before)
})
