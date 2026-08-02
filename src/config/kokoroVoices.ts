export type KokoroVoiceGender = 'female' | 'male'
export type KokoroVoiceRegion =
  | 'american'
  | 'british'
  | 'spanish'
  | 'french'
  | 'hindi'
  | 'italian'
  | 'japanese'
  | 'portuguese'
  | 'chinese'

export const KOKORO_VOICES = [
  { id: 0, modelName: 'af_alloy', name: 'Alloy', gender: 'female', region: 'american', textLanguage: 'en' },
  { id: 1, modelName: 'af_aoede', name: 'Aoede', gender: 'female', region: 'american', textLanguage: 'en' },
  { id: 2, modelName: 'af_bella', name: 'Bella', gender: 'female', region: 'american', textLanguage: 'en' },
  { id: 3, modelName: 'af_heart', name: 'Heart', gender: 'female', region: 'american', textLanguage: 'en' },
  { id: 4, modelName: 'af_jessica', name: 'Jessica', gender: 'female', region: 'american', textLanguage: 'en' },
  { id: 5, modelName: 'af_kore', name: 'Kore', gender: 'female', region: 'american', textLanguage: 'en' },
  { id: 6, modelName: 'af_nicole', name: 'Nicole', gender: 'female', region: 'american', textLanguage: 'en' },
  { id: 7, modelName: 'af_nova', name: 'Nova', gender: 'female', region: 'american', textLanguage: 'en' },
  { id: 8, modelName: 'af_river', name: 'River', gender: 'female', region: 'american', textLanguage: 'en' },
  { id: 9, modelName: 'af_sarah', name: 'Sarah', gender: 'female', region: 'american', textLanguage: 'en' },
  { id: 10, modelName: 'af_sky', name: 'Sky', gender: 'female', region: 'american', textLanguage: 'en' },
  { id: 11, modelName: 'am_adam', name: 'Adam', gender: 'male', region: 'american', textLanguage: 'en' },
  { id: 12, modelName: 'am_echo', name: 'Echo', gender: 'male', region: 'american', textLanguage: 'en' },
  { id: 13, modelName: 'am_eric', name: 'Eric', gender: 'male', region: 'american', textLanguage: 'en' },
  { id: 14, modelName: 'am_fenrir', name: 'Fenrir', gender: 'male', region: 'american', textLanguage: 'en' },
  { id: 15, modelName: 'am_liam', name: 'Liam', gender: 'male', region: 'american', textLanguage: 'en' },
  { id: 16, modelName: 'am_michael', name: 'Michael', gender: 'male', region: 'american', textLanguage: 'en' },
  { id: 17, modelName: 'am_onyx', name: 'Onyx', gender: 'male', region: 'american', textLanguage: 'en' },
  { id: 18, modelName: 'am_puck', name: 'Puck', gender: 'male', region: 'american', textLanguage: 'en' },
  { id: 19, modelName: 'am_santa', name: 'Santa', gender: 'male', region: 'american', textLanguage: 'en' },
  { id: 20, modelName: 'bf_alice', name: 'Alice', gender: 'female', region: 'british', textLanguage: 'en' },
  { id: 21, modelName: 'bf_emma', name: 'Emma', gender: 'female', region: 'british', textLanguage: 'en' },
  { id: 22, modelName: 'bf_isabella', name: 'Isabella', gender: 'female', region: 'british', textLanguage: 'en' },
  { id: 23, modelName: 'bf_lily', name: 'Lily', gender: 'female', region: 'british', textLanguage: 'en' },
  { id: 24, modelName: 'bm_daniel', name: 'Daniel', gender: 'male', region: 'british', textLanguage: 'en' },
  { id: 25, modelName: 'bm_fable', name: 'Fable', gender: 'male', region: 'british', textLanguage: 'en' },
  { id: 26, modelName: 'bm_george', name: 'George', gender: 'male', region: 'british', textLanguage: 'en' },
  { id: 27, modelName: 'bm_lewis', name: 'Lewis', gender: 'male', region: 'british', textLanguage: 'en' },
  { id: 28, modelName: 'ef_dora', name: 'Dora', gender: 'female', region: 'spanish', textLanguage: 'en' },
  { id: 29, modelName: 'em_alex', name: 'Alex', gender: 'male', region: 'spanish', textLanguage: 'en' },
  { id: 30, modelName: 'ff_siwis', name: 'Siwis', gender: 'female', region: 'french', textLanguage: 'en' },
  { id: 31, modelName: 'hf_alpha', name: 'Alpha', gender: 'female', region: 'hindi', textLanguage: 'en' },
  { id: 32, modelName: 'hf_beta', name: 'Beta', gender: 'female', region: 'hindi', textLanguage: 'en' },
  { id: 33, modelName: 'hm_omega', name: 'Omega', gender: 'male', region: 'hindi', textLanguage: 'en' },
  { id: 34, modelName: 'hm_psi', name: 'Psi', gender: 'male', region: 'hindi', textLanguage: 'en' },
  { id: 35, modelName: 'if_sara', name: 'Sara', gender: 'female', region: 'italian', textLanguage: 'en' },
  { id: 36, modelName: 'im_nicola', name: 'Nicola', gender: 'male', region: 'italian', textLanguage: 'en' },
  { id: 37, modelName: 'jf_alpha', name: 'Alpha', gender: 'female', region: 'japanese', textLanguage: 'en' },
  { id: 38, modelName: 'jf_gongitsune', name: 'Gongitsune', gender: 'female', region: 'japanese', textLanguage: 'en' },
  { id: 39, modelName: 'jf_nezumi', name: 'Nezumi', gender: 'female', region: 'japanese', textLanguage: 'en' },
  { id: 40, modelName: 'jf_tebukuro', name: 'Tebukuro', gender: 'female', region: 'japanese', textLanguage: 'en' },
  { id: 41, modelName: 'jm_kumo', name: 'Kumo', gender: 'male', region: 'japanese', textLanguage: 'en' },
  { id: 42, modelName: 'pf_dora', name: 'Dora', gender: 'female', region: 'portuguese', textLanguage: 'en' },
  { id: 43, modelName: 'pm_alex', name: 'Alex', gender: 'male', region: 'portuguese', textLanguage: 'en' },
  { id: 44, modelName: 'pm_santa', name: 'Santa', gender: 'male', region: 'portuguese', textLanguage: 'en' },
  { id: 45, modelName: 'zf_xiaobei', name: 'Xiaobei', nameZh: '晓北', gender: 'female', region: 'chinese', textLanguage: 'zh' },
  { id: 46, modelName: 'zf_xiaoni', name: 'Xiaoni', nameZh: '晓妮', gender: 'female', region: 'chinese', textLanguage: 'zh' },
  { id: 47, modelName: 'zf_xiaoxiao', name: 'Xiaoxiao', nameZh: '晓晓', gender: 'female', region: 'chinese', textLanguage: 'zh' },
  { id: 48, modelName: 'zf_xiaoyi', name: 'Xiaoyi', nameZh: '晓伊', gender: 'female', region: 'chinese', textLanguage: 'zh' },
  { id: 49, modelName: 'zm_yunjian', name: 'Yunjian', nameZh: '云健', gender: 'male', region: 'chinese', textLanguage: 'zh' },
  { id: 50, modelName: 'zm_yunxi', name: 'Yunxi', nameZh: '云希', gender: 'male', region: 'chinese', textLanguage: 'zh' },
  { id: 51, modelName: 'zm_yunxia', name: 'Yunxia', nameZh: '云夏', gender: 'male', region: 'chinese', textLanguage: 'zh' },
  { id: 52, modelName: 'zm_yunyang', name: 'Yunyang', nameZh: '云扬', gender: 'male', region: 'chinese', textLanguage: 'zh' },
] as const

export type KokoroVoice = (typeof KOKORO_VOICES)[number]
export type KokoroSpeakerId = KokoroVoice['id']

export const KOKORO_CHINESE_VOICES = KOKORO_VOICES.filter(
  (voice) => voice.region === 'chinese',
)

const GROUP_ORDER: KokoroVoiceRegion[] = [
  'american', 'british', 'spanish', 'french', 'hindi',
  'italian', 'japanese', 'portuguese', 'chinese',
]

export const KOKORO_VOICE_GROUPS = GROUP_ORDER.map((region) => ({
  region,
  count: KOKORO_VOICES.filter((voice) => voice.region === region).length,
}))

export const DEFAULT_KOKORO_SPEAKER_ID: KokoroSpeakerId = 47

export function isKokoroSpeakerId(value: unknown): value is KokoroSpeakerId {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 52
}

export function normalizeKokoroSpeakerId(value: unknown): KokoroSpeakerId {
  return isKokoroSpeakerId(value) ? value : DEFAULT_KOKORO_SPEAKER_ID
}

export function getKokoroVoice(id: unknown): KokoroVoice {
  const normalized = normalizeKokoroSpeakerId(id)
  return KOKORO_VOICES.find((voice) => voice.id === normalized)!
}

export function getKokoroVoiceLabel(voice: KokoroVoice, chinese: boolean): string {
  if (!('nameZh' in voice)) return voice.name
  return chinese ? `${voice.nameZh} · ${voice.name}` : `${voice.name} · ${voice.nameZh}`
}
