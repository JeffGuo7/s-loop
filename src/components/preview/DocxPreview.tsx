import { useEffect, useState } from 'react'
import { getErrorMessage } from '../../utils/errors'

interface DocxPreviewProps {
  filePath: string
  onLoaded: () => void
  onError: (msg: string) => void
}

export function DocxPreview({ filePath, onLoaded, onError }: DocxPreviewProps) {
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const mammoth = await import('mammoth')
        const { invoke } = await import('@tauri-apps/api/core')
        const base64 = await invoke<string>('read_file_base64', { path: filePath })

        const binaryString = atob(base64)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }

        const result = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer })
        if (!cancelled) {
          setHtml(result.value)
          onLoaded()
        }
      } catch (err) {
        if (!cancelled) {
          onError(getErrorMessage(err))
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [filePath, onLoaded, onError])

  if (html === null) return null

  return (
    <div
      className="h-full overflow-auto px-6 py-5 prose prose-sm dark:prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
