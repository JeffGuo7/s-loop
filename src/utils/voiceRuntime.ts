import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import {
  DEFAULT_KOKORO_SPEAKER_ID,
  type KokoroSpeakerId,
} from '../config/kokoroVoices'

export type VoiceAssetKind = 'streaming-asr' | 'vad' | 'tts'

export interface VoiceAssetStatus {
  kind: VoiceAssetKind
  name: string
  installed: boolean
  downloadInProgress: boolean
  diskBytes: number
}

export interface VoiceRuntimeStatus {
  assets: VoiceAssetStatus[]
  speaking: boolean
  listening: boolean
}

export interface VoiceAssetProgress {
  kind: VoiceAssetKind
  phase: 'downloading' | 'installing' | 'ready'
  downloadedBytes: number
  totalBytes: number
}

export type SpeechPlaybackState = 'loading' | 'speaking' | 'idle' | 'error'

export interface SpeechPlaybackEvent {
  requestId: number
  state: SpeechPlaybackState
  progress: number
  message?: string | null
}

export type RealtimeEventKind =
  | 'state'
  | 'level'
  | 'partial'
  | 'final'
  | 'speech-start'
  | 'speech-end'
  | 'error'

export interface RealtimeVoiceEvent {
  kind: RealtimeEventKind
  state?: 'starting' | 'listening' | 'stopped' | null
  text?: string | null
  level?: number | null
  turnComplete: boolean
  message?: string | null
}

export const getVoiceRuntimeStatus = () =>
  invoke<VoiceRuntimeStatus>('get_voice_runtime_status')

export const downloadVoiceAsset = (kind: VoiceAssetKind, githubMirror?: string) =>
  invoke<VoiceRuntimeStatus>('download_voice_asset', { kind, githubMirror })

export const cancelVoiceAssetDownload = () =>
  invoke<void>('cancel_voice_asset_download')

export const deleteVoiceAsset = (kind: VoiceAssetKind) =>
  invoke<VoiceRuntimeStatus>('delete_voice_asset', { kind })

export const speakText = (
  text: string,
  speed = 1,
  speakerId: KokoroSpeakerId = DEFAULT_KOKORO_SPEAKER_ID,
) => invoke<number>('speak_text', { text, speed, speakerId })

export const stopSpeaking = () =>
  invoke<void>('stop_speaking')

export const startRealtimeVoice = () =>
  invoke<VoiceRuntimeStatus>('start_realtime_voice')

export const stopRealtimeVoice = () =>
  invoke<VoiceRuntimeStatus>('stop_realtime_voice')

export const cancelRealtimeVoice = () =>
  invoke<VoiceRuntimeStatus>('cancel_realtime_voice')

export const listenVoiceAssetProgress = (
  handler: (progress: VoiceAssetProgress) => void,
) =>
  listen<VoiceAssetProgress>('voice-asset-progress', (event) => {
    handler(event.payload)
  })

export const listenSpeechPlayback = (
  handler: (event: SpeechPlaybackEvent) => void,
) =>
  listen<SpeechPlaybackEvent>('voice-playback', (event) => {
    handler(event.payload)
  })

export const listenRealtimeVoice = (
  handler: (event: RealtimeVoiceEvent) => void,
) =>
  listen<RealtimeVoiceEvent>('voice-realtime', (event) => {
    handler(event.payload)
  })

export const voiceAsset = (
  status: VoiceRuntimeStatus | null | undefined,
  kind: VoiceAssetKind,
) => status?.assets.find((asset) => asset.kind === kind)
