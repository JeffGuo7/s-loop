import { describe, it, expect } from 'vitest'
import { parseSessionModel, enrichSession } from '../src/utils/sessionMeta'

describe('parseSessionModel', () => {
  it('returns local source when model is null', () => {
    const result = parseSessionModel(null)
    expect(result).toEqual({ source: 'local', readOnly: false })
  })

  it('returns local source when model is undefined', () => {
    const result = parseSessionModel(undefined)
    expect(result).toEqual({ source: 'local', readOnly: false })
  })

  it('returns local source when model is empty string', () => {
    const result = parseSessionModel('')
    expect(result).toEqual({ source: 'local', readOnly: false })
  })

  it('returns local source for a plain model ID', () => {
    const result = parseSessionModel('claude-sonnet-4-20250514')
    expect(result).toEqual({ source: 'local', readOnly: false })
  })

  it('parses platform: prefix correctly', () => {
    const result = parseSessionModel('platform:telegram')
    expect(result).toEqual({
      source: 'platform',
      platformId: 'telegram',
      sourceLabel: 'Telegram',
      readOnly: true,
    })
  })

  it('handles all platform IDs', () => {
    const platforms = ['telegram', 'email', 'webhook', 'feishu', 'dingtalk', 'wechat'] as const
    for (const p of platforms) {
      const result = parseSessionModel(`platform:${p}`)
      expect(result.source).toBe('platform')
      expect(result.platformId).toBe(p)
      expect(result.sourceLabel).toBeTruthy()
      expect(result.readOnly).toBe(true)
    }
  })

  it('falls back to raw platform ID when label is unknown', () => {
    const result = parseSessionModel('platform:unknown')
    expect(result).toEqual({
      source: 'platform',
      platformId: 'unknown',
      sourceLabel: 'unknown',
      readOnly: true,
    })
  })

  it('trims whitespace from model value', () => {
    const result = parseSessionModel('  platform:telegram  ')
    expect(result.source).toBe('platform')
    expect(result.platformId).toBe('telegram')
  })
})

describe('enrichSession', () => {
  it('adds source fields to a local session', () => {
    const session = { id: 'abc', model: 'claude-sonnet-4-20250514', title: 'Test' }
    const enriched = enrichSession(session)
    expect(enriched).toEqual({
      id: 'abc',
      model: 'claude-sonnet-4-20250514',
      title: 'Test',
      source: 'local',
      readOnly: false,
    })
  })

  it('adds source fields to a platform session', () => {
    const session = { id: 'xyz', model: 'platform:telegram', title: 'TG Chat' }
    const enriched = enrichSession(session)
    expect(enriched).toEqual({
      id: 'xyz',
      model: 'platform:telegram',
      title: 'TG Chat',
      source: 'platform',
      platformId: 'telegram',
      sourceLabel: 'Telegram',
      readOnly: true,
    })
  })

  it('handles model as undefined', () => {
    const session = { id: 'abc', model: undefined, title: 'No model' }
    const enriched = enrichSession(session as any)
    expect(enriched.source).toBe('local')
    expect(enriched.readOnly).toBe(false)
  })
})
