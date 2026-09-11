// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { FileChip } from '../src/components/chat/shared/FileChip'
import { useAppStore } from '../src/stores/appStore'
import { useFilePreviewStore } from '../src/stores/filePreviewStore'

describe('FileChip', () => {
  beforeEach(() => {
    useFilePreviewStore.getState().closePreview()
    useAppStore.setState({ workspaceDir: 'C:/users/me/project' })
  })

  it('opens the preview with an absolute path resolved against the workspace', () => {
    render(<FileChip name="energy.pptx" path="decks/energy.pptx" />)
    fireEvent.click(screen.getByTitle('decks/energy.pptx — click to preview'))

    const preview = useFilePreviewStore.getState().preview
    expect(preview?.filePath).toBe('C:/users/me/project/decks/energy.pptx')
    expect(preview?.fileName).toBe('energy.pptx')
  })

  it('keeps absolute paths as-is', () => {
    render(<FileChip name="a.pptx" path="D:/absolute/decks/a.pptx" />)
    fireEvent.click(screen.getByTitle('D:/absolute/decks/a.pptx — click to preview'))

    expect(useFilePreviewStore.getState().preview?.filePath).toBe('D:/absolute/decks/a.pptx')
  })

  it('is not clickable without a resolvable path', () => {
    useAppStore.setState({ workspaceDir: null })
    render(<FileChip name="a.pptx" path="decks/a.pptx" />)
    fireEvent.click(screen.getByTitle('decks/a.pptx'))

    expect(useFilePreviewStore.getState().preview).toBeNull()
  })
})
