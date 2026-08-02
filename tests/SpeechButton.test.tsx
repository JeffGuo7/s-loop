// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { SpeechButton } from '../src/components/chat/shared/SpeechButton'

describe('SpeechButton', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset()
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === 'get_voice_runtime_status') {
        return {
          assets: [{ kind: 'tts', installed: true, downloadInProgress: false, diskBytes: 1 }],
          speaking: false,
          listening: false,
        }
      }
      if (command === 'speak_text') return 7
      return undefined
    })
  })

  it('uses the shared speakable-text policy for manual read-aloud', async () => {
    render(<SpeechButton text="晚上好 😊 [文档](https://example.com)" label="朗读" />)

    await waitFor(() => expect(screen.getByRole('button', { name: '朗读' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: '朗读' }))

    await waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith(
        'speak_text',
        expect.objectContaining({ text: '晚上好 文档' }),
      )
    })
  })
})
