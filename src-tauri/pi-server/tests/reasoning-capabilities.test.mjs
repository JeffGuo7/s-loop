import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  applyThinkingLevel,
  describeModel,
  describeReasoningCapabilities,
  getSupportedThinkingLevels,
  getConfiguredThinkingLevel,
  resolveCustomReasoningConfig,
  resolveThinkingLevel,
} from '../reasoning-capabilities.mjs'

const deepSeekModel = {
  id: 'deepseek-v4-pro',
  provider: 'deepseek',
  reasoning: true,
  thinkingLevelMap: {
    minimal: null,
    low: null,
    medium: null,
    high: 'high',
    max: 'max',
  },
}

describe('reasoning capabilities', () => {
  it('exposes only the effective DeepSeek levels', () => {
    assert.deepEqual(getSupportedThinkingLevels(deepSeekModel), ['off', 'high', 'max'])
    assert.deepEqual(describeReasoningCapabilities(deepSeekModel), {
      reasoning: true,
      supportedThinkingLevels: ['off', 'high', 'max'],
      recommendedThinkingLevel: 'high',
    })
  })

  it('clamps unsupported DeepSeek levels to the provider mapping', () => {
    assert.equal(resolveThinkingLevel(deepSeekModel, 'low'), 'high')
    assert.equal(resolveThinkingLevel(deepSeekModel, 'medium'), 'high')
    assert.equal(resolveThinkingLevel(deepSeekModel, 'xhigh'), 'max')
  })

  it('does not offer off when a reasoning model cannot disable thinking', () => {
    const alwaysThinking = {
      reasoning: true,
      thinkingLevelMap: { off: null },
    }

    assert.deepEqual(getSupportedThinkingLevels(alwaysThinking), ['minimal', 'low', 'medium', 'high'])
    assert.equal(resolveThinkingLevel(alwaysThinking, 'off'), 'minimal')
  })

  it('reports non-reasoning models as off-only', () => {
    const model = { reasoning: false }
    assert.deepEqual(getSupportedThinkingLevels(model), ['off'])
    assert.equal(resolveThinkingLevel(model, 'high'), 'off')
  })

  it('describes model identity together with reasoning capabilities', () => {
    assert.deepEqual(describeModel({ ...deepSeekModel, name: 'DeepSeek V4 Pro' }), {
      id: 'deepseek-v4-pro',
      name: 'DeepSeek V4 Pro',
      reasoning: true,
      supportedThinkingLevels: ['off', 'high', 'max'],
      recommendedThinkingLevel: 'high',
    })
  })

  it('updates an existing agent with the effective requested level', () => {
    const agent = { state: { thinkingLevel: 'high' } }
    assert.equal(applyThinkingLevel(agent, deepSeekModel, 'max'), 'max')
    assert.equal(agent.state.thinkingLevel, 'max')

    assert.equal(applyThinkingLevel(agent, deepSeekModel, 'medium'), 'high')
    assert.equal(agent.state.thinkingLevel, 'high')
  })

  it('uses the current model preference across background runtimes', () => {
    assert.equal(getConfiguredThinkingLevel({
      modelID: 'deepseek-v4-pro',
      providerConfig: {
        reasoningEfforts: {
          'deepseek-v4-flash': 'off',
          'deepseek-v4-pro': 'max',
        },
      },
    }), 'max')
    assert.equal(getConfiguredThinkingLevel({ modelID: 'another-model' }), 'medium')
  })
})

describe('custom reasoning compatibility', () => {
  it('enables a manually declared DeepSeek-compatible model', () => {
    assert.deepEqual(
      resolveCustomReasoningConfig('custom', 'my-reasoning-model', {
        baseUrl: 'https://gateway.example.com/v1',
        reasoningSupport: 'enabled',
        thinkingFormat: 'deepseek',
      }),
      {
        reasoning: true,
        thinkingLevelMap: {
          minimal: null,
          low: null,
          medium: null,
          high: 'high',
          max: 'max',
        },
        compat: { thinkingFormat: 'deepseek', supportsReasoningEffort: true },
      },
    )
  })

  it('auto-detects known reasoning model names but keeps unknown models safe', () => {
    assert.equal(
      resolveCustomReasoningConfig('openrouter', 'deepseek/deepseek-r1', {
        baseUrl: 'https://openrouter.ai/api/v1',
        reasoningSupport: 'auto',
      }).reasoning,
      true,
    )
    assert.equal(
      resolveCustomReasoningConfig('custom', 'ordinary-chat-model', {
        baseUrl: 'https://gateway.example.com/v1',
        reasoningSupport: 'auto',
      }).reasoning,
      false,
    )
  })
})
