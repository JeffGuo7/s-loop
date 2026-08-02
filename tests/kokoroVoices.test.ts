import { describe, expect, it } from 'vitest'
import {
  DEFAULT_KOKORO_SPEAKER_ID,
  KOKORO_CHINESE_VOICES,
  normalizeKokoroSpeakerId,
} from '../src/config/kokoroVoices'

describe('Kokoro Chinese voice catalog', () => {
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

  it('falls back safely when persisted data is not a Chinese speaker ID', () => {
    expect(normalizeKokoroSpeakerId(52)).toBe(52)
    expect(normalizeKokoroSpeakerId(0)).toBe(DEFAULT_KOKORO_SPEAKER_ID)
    expect(normalizeKokoroSpeakerId('47')).toBe(DEFAULT_KOKORO_SPEAKER_ID)
    expect(normalizeKokoroSpeakerId(undefined)).toBe(DEFAULT_KOKORO_SPEAKER_ID)
  })
})
