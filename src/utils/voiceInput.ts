import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

export interface VoiceInputStatus {
  recording: boolean
  modelInstalled: boolean
  modelVerified: boolean
  testPassed: boolean
  downloadInProgress: boolean
  modelName: string
  modelBytes: number
  supported: boolean
  deviceSummary: string
  compatibilityReason?: string | null
}

export interface DictationDownloadProgress {
  downloadedBytes: number
  totalBytes: number
}

export const isTauriRuntime = () =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export const getDictationStatus = () =>
  invoke<VoiceInputStatus>('get_dictation_status')

export const startDictation = () =>
  invoke<VoiceInputStatus>('start_dictation')

export const stopDictation = () =>
  invoke<string>('stop_dictation')

export const cancelDictation = () =>
  invoke<void>('cancel_dictation')

export const getDictationLevel = () =>
  invoke<number>('dictation_level')

export const downloadDictationModel = () =>
  invoke<VoiceInputStatus>('download_dictation_model')

export const cancelDictationModelDownload = () =>
  invoke<void>('cancel_dictation_model_download')

export const verifyDictationModel = () =>
  invoke<VoiceInputStatus>('verify_dictation_model')

export const markDictationTestPassed = () =>
  invoke<VoiceInputStatus>('mark_dictation_test_passed')

export const deleteDictationModel = () =>
  invoke<VoiceInputStatus>('delete_dictation_model')

export const listenDictationDownloadProgress = (
  handler: (progress: DictationDownloadProgress) => void,
) =>
  listen<DictationDownloadProgress>('dictation-download-progress', (event) => {
    handler(event.payload)
  })

export const publishVoiceInputStatus = (status?: VoiceInputStatus) => {
  window.dispatchEvent(new CustomEvent('s-loop:voice-input-changed', { detail: status }))
}

export const openVoiceInputSettings = () => {
  window.dispatchEvent(new CustomEvent('s-loop:open-settings', { detail: 'voice' }))
}
