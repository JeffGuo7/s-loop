import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import {
  cancelDictation,
  downloadDictationModel,
  getDictationLevel,
  getDictationStatus,
  startDictation,
  stopDictation,
} from '../src/utils/voiceInput'

describe('voice input command boundary', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset()
  })

  it('maps status, recording, and model commands to Tauri', async () => {
    vi.mocked(invoke).mockResolvedValue(undefined)

    await getDictationStatus()
    await startDictation()
    await stopDictation()
    await cancelDictation()
    await getDictationLevel()
    await downloadDictationModel()

    expect(vi.mocked(invoke).mock.calls.map(([command]) => command)).toEqual([
      'get_dictation_status',
      'start_dictation',
      'stop_dictation',
      'cancel_dictation',
      'dictation_level',
      'download_dictation_model',
    ])
  })
})
