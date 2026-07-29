// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { ChatInput } from '../src/components/chat/ChatInput'

const ready = {
  recording: false,
  modelInstalled: true,
  modelVerified: true,
  testPassed: true,
  downloadInProgress: false,
  modelName: 'Whisper Base Multilingual (local)',
  modelBytes: 147951465,
  supported: true,
  deviceSummary: 'Windows · x86_64',
  compatibilityReason: null,
}

describe('ChatInput local dictation', () => {
  beforeEach(() => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      configurable: true,
    })
    vi.mocked(invoke).mockReset()
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === 'get_dictation_status') return ready
      if (command === 'start_dictation') return { ...ready, recording: true }
      if (command === 'stop_dictation') return '你好 Snotra'
      if (command === 'dictation_level') return 0.5
      return undefined
    })
  })

  it('records locally and appends the transcript without sending', async () => {
    const onSubmit = vi.fn()
    render(<ChatInput onSubmit={onSubmit} />)

    fireEvent.click(await screen.findByLabelText('Start dictation'))
    fireEvent.click(await screen.findByLabelText('Stop dictation'))

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toHaveValue('你好 Snotra')
    })
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
