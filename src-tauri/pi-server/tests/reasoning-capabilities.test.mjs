import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  describeReasoningCapabilities,
  getSupportedThinkingLevels,
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
