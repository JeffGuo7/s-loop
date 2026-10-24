import { useEffect, useState } from 'react'
import DOMPurify from 'dompurify'

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
          onError(err instanceof Error ? err.message : String(err))
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [filePath, onLoaded, onError])

  if (html === null) return null

  // Mammoth output is document-derived, not trusted: sanitize before it
  // touches the DOM (base64 <img> data URIs from the document are kept).
  const safeHtml = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })

  return (
    <div
      className="h-full overflow-auto px-6 py-5 prose prose-sm dark:prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  )
}
