export const KOKORO_CHINESE_VOICES = [
  { id: 45, nameZh: '晓北', nameEn: 'Xiaobei', gender: 'female' },
  { id: 46, nameZh: '晓妮', nameEn: 'Xiaoni', gender: 'female' },
  { id: 47, nameZh: '晓晓', nameEn: 'Xiaoxiao', gender: 'female' },
  { id: 48, nameZh: '晓伊', nameEn: 'Xiaoyi', gender: 'female' },
  { id: 49, nameZh: '云健', nameEn: 'Yunjian', gender: 'male' },
  { id: 50, nameZh: '云希', nameEn: 'Yunxi', gender: 'male' },
  { id: 51, nameZh: '云夏', nameEn: 'Yunxia', gender: 'male' },
  { id: 52, nameZh: '云扬', nameEn: 'Yunyang', gender: 'male' },
] as const

export type KokoroChineseVoice = (typeof KOKORO_CHINESE_VOICES)[number]
export type KokoroSpeakerId = KokoroChineseVoice['id']

export const DEFAULT_KOKORO_SPEAKER_ID: KokoroSpeakerId = 47

export function isKokoroSpeakerId(value: unknown): value is KokoroSpeakerId {
  return KOKORO_CHINESE_VOICES.some((voice) => voice.id === value)
}

export function normalizeKokoroSpeakerId(value: unknown): KokoroSpeakerId {
  return isKokoroSpeakerId(value) ? value : DEFAULT_KOKORO_SPEAKER_ID
}

export function getKokoroVoice(id: unknown): KokoroChineseVoice {
  const normalized = normalizeKokoroSpeakerId(id)
  return KOKORO_CHINESE_VOICES.find((voice) => voice.id === normalized)!
}
