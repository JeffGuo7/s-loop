import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import {
  cancelRealtimeVoice,
  cancelVoiceAssetDownload,
  deleteVoiceAsset,
  downloadVoiceAsset,
  getVoiceRuntimeStatus,
  speakText,
  startRealtimeVoice,
  stopRealtimeVoice,
  stopSpeaking,
} from '../src/utils/voiceRuntime'
import {
  shouldInterruptVoicePlayback,
  speechTextFromMarkdown,
} from '../src/utils/voiceConversation'

describe('real-time voice command boundary', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset()
    vi.mocked(invoke).mockResolvedValue(undefined)
  })

  it('maps model, speech, and streaming operations to Tauri', async () => {
    await getVoiceRuntimeStatus()
    await downloadVoiceAsset('streaming-asr', 'https://mirror.example/')
    await cancelVoiceAssetDownload()
    await deleteVoiceAsset('vad')
    await speakText('hello', 1.1)
    await stopSpeaking()
    await startRealtimeVoice()
    await stopRealtimeVoice()
    await cancelRealtimeVoice()

    expect(vi.mocked(invoke).mock.calls).toEqual([
      ['get_voice_runtime_status'],
      [
        'download_voice_asset',
        {
          kind: 'streaming-asr',
          githubMirror: 'https://mirror.example/',
        },
      ],
      ['cancel_voice_asset_download'],
      ['delete_voice_asset', { kind: 'vad' }],
      ['speak_text', { text: 'hello', speed: 1.1 }],
      ['stop_speaking'],
      ['start_realtime_voice'],
      ['stop_realtime_voice'],
      ['cancel_realtime_voice'],
    ])
  })

  it('requires sustained cleaned speech before interrupting playback', () => {
    const speaking = { active: true, state: 'speaking' as const }

    expect(
      shouldInterruptVoicePlayback('conversation', speaking, 1_000, 0.08, 1_500),
    ).toBe(true)
    expect(
      shouldInterruptVoicePlayback('conversation', speaking, 1_000, 0.08, 1_200),
    ).toBe(false)
    expect(
      shouldInterruptVoicePlayback('conversation', speaking, 1_000, 0.01, 1_500),
    ).toBe(false)
    expect(
      shouldInterruptVoicePlayback('dictation', speaking, 1_000, 0.08, 1_500),
    ).toBe(false)
  })

  it('turns assistant markdown into speakable text', () => {
    expect(
      speechTextFromMarkdown(
        '# 结果\n\n请看[文档](https://example.com)。\n```ts\nconst secret = 1\n```',
      ),
    ).toBe('结果。请看文档。 代码块。')
  })
})
