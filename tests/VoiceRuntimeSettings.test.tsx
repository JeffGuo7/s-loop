// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { VoiceRuntimeSettings } from '../src/components/settings/VoiceRuntimeSettings'
import { useAppStore } from '../src/stores/appStore'

const readyStatus = {
  assets: [
    {
      kind: 'streaming-asr',
      name: 'Streaming ASR',
      installed: true,
      downloadInProgress: false,
      diskBytes: 1,
    },
    {
      kind: 'vad',
      name: 'VAD',
      installed: true,
      downloadInProgress: false,
      diskBytes: 1,
    },
    {
      kind: 'tts',
      name: 'Kokoro',
      installed: true,
      downloadInProgress: false,
      diskBytes: 1,
    },
  ],
  speaking: false,
  listening: false,
}

describe('VoiceRuntimeSettings Kokoro voice selection', () => {
  beforeEach(() => {
    useAppStore.getState().setKokoroSpeakerId(47)
    vi.mocked(invoke).mockReset()
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === 'get_voice_runtime_status') return readyStatus
      if (command === 'speak_text') return 1
      return undefined
    })
  })

  it('selects a Chinese speaker and uses it for the preview', async () => {
    render(<VoiceRuntimeSettings />)

    const xiaoyi = await screen.findByRole('radio', { name: /晓伊/ })
    fireEvent.click(xiaoyi)
    expect(useAppStore.getState().kokoroSpeakerId).toBe(48)

    fireEvent.click(screen.getByRole('button', { name: /晓伊/ }))

    await waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith(
        'speak_text',
        expect.objectContaining({
          speakerId: 48,
          text: expect.stringContaining('123'),
        }),
      )
    })
  })

  it('opens the complete catalog and selects an American voice', async () => {
    render(<VoiceRuntimeSettings />)

    fireEvent.click(await screen.findByRole('button', { name: /全部 53/ }))
    expect(await screen.findAllByRole('radio')).toHaveLength(53)

    fireEvent.click(screen.getByRole('radio', { name: /Alloy/ }))
    expect(useAppStore.getState().kokoroSpeakerId).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: /Alloy/ }))
    await waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith(
        'speak_text',
        expect.objectContaining({ speakerId: 0 }),
      )
    })
  })
})
