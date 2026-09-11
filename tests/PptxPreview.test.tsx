// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import JSZip from 'jszip'
import { setServerConnection } from '../src/utils/piClient'
import { PptxPreview } from '../src/components/preview/PptxPreview'
import { useFilePreviewStore } from '../src/stores/filePreviewStore'

const MINIMAL_SLIDE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
            <a:r><a:t>Hello fallback preview</a:t></a:r>
          </a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`

async function makePptxBytes(): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<Types/>')
  zip.file('ppt/slides/slide1.xml', MINIMAL_SLIDE_XML)
  const arrayBuffer = await zip.generateAsync({ type: 'uint8array' })
  return arrayBuffer
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

describe('PptxPreview', () => {
  const realFetch = globalThis.fetch

  beforeEach(() => {
    vi.mocked(invoke).mockReset()
    setServerConnection('http://127.0.0.1:4096', 'test-token')
    useFilePreviewStore.getState().closePreview()
  })

  afterEach(() => {
    globalThis.fetch = realFetch
    vi.restoreAllMocks()
  })

  it('renders the officecli HTML document when the preview endpoint succeeds', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response('<html><body><h1>Rendered deck</h1></body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    ) as unknown as typeof fetch

    const onLoaded = vi.fn()
    render(<PptxPreview filePath="C:/ws/decks/a.pptx" onLoaded={onLoaded} onError={vi.fn()} />)

    const frame = await screen.findByTitle('PPTX preview')
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts')
    expect(frame.getAttribute('srcdoc')).toContain('Rendered deck')

    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toBe('http://127.0.0.1:4096/preview/pptx?path=' + encodeURIComponent('C:/ws/decks/a.pptx'))
    await waitFor(() => expect(onLoaded).toHaveBeenCalled())
  })

  it('falls back to OOXML text extraction when the endpoint fails', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'officecli unavailable' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as typeof fetch

    const bytes = await makePptxBytes()
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === 'read_file_base64') return base64FromBytes(bytes)
      return undefined
    })

    render(<PptxPreview filePath="C:/ws/decks/a.pptx" onLoaded={vi.fn()} onError={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText(/Hello fallback preview/)).toBeTruthy()
    })
    expect(screen.getByText('1 / 1')).toBeTruthy()
  })
})
