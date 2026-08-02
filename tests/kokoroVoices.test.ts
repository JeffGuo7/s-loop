import { describe, expect, it } from 'vitest'
import {
  DEFAULT_KOKORO_SPEAKER_ID,
  KOKORO_CHINESE_VOICES,
  KOKORO_VOICE_GROUPS,
  KOKORO_VOICES,
  normalizeKokoroSpeakerId,
} from '../src/config/kokoroVoices'

describe('Kokoro voice catalog', () => {
  it('exposes all 53 bundled speaker identities', () => {
    expect(KOKORO_VOICES).toHaveLength(53)
    expect(KOKORO_VOICES.map((voice) => voice.id)).toEqual(
      Array.from({ length: 53 }, (_, index) => index),
    )
  })

  it('groups voices by origin and gender without claiming extra text languages', () => {
    expect(KOKORO_VOICE_GROUPS.map((group) => [group.region, group.count])).toEqual([
      ['american', 20],
      ['british', 8],
      ['spanish', 2],
      ['french', 1],
      ['hindi', 4],
      ['italian', 2],
      ['japanese', 5],
      ['portuguese', 3],
      ['chinese', 8],
    ])
    expect(KOKORO_VOICES.every((voice) => voice.textLanguage === 'en' || voice.textLanguage === 'zh')).toBe(true)
  })

  it('exposes the eight Chinese speakers supported by the installed model', () => {
    expect(KOKORO_CHINESE_VOICES.map((voice) => voice.id)).toEqual([
      45, 46, 47, 48, 49, 50, 51, 52,
    ])
    expect(KOKORO_CHINESE_VOICES.map((voice) => voice.nameZh)).toEqual([
      '晓北',
      '晓妮',
      '晓晓',
      '晓伊',
      '云健',
      '云希',
      '云夏',
      '云扬',
    ])
  })

  it('uses a neutral Chinese voice by default', () => {
    expect(DEFAULT_KOKORO_SPEAKER_ID).toBe(47)
  })

  it('accepts the complete range and falls back safely outside it', () => {
    expect(normalizeKokoroSpeakerId(52)).toBe(52)
    expect(normalizeKokoroSpeakerId(0)).toBe(0)
    expect(normalizeKokoroSpeakerId(44)).toBe(44)
    expect(normalizeKokoroSpeakerId(53)).toBe(DEFAULT_KOKORO_SPEAKER_ID)
    expect(normalizeKokoroSpeakerId(-1)).toBe(DEFAULT_KOKORO_SPEAKER_ID)
    expect(normalizeKokoroSpeakerId('47')).toBe(DEFAULT_KOKORO_SPEAKER_ID)
    expect(normalizeKokoroSpeakerId(undefined)).toBe(DEFAULT_KOKORO_SPEAKER_ID)
  })
})
