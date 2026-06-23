import { useEffect, useState, useRef } from 'react'

interface PdfPreviewProps {
  filePath: string
  onLoaded: () => void
  onError: (msg: string) => void
}

export function PdfPreview({ filePath, onLoaded, onError }: PdfPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const pdfRef = useRef<any>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString()

        const { invoke } = await import('@tauri-apps/api/core')
        const base64 = await invoke<string>('read_file_base64', { path: filePath })
        const binaryString = atob(base64)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }

        const pdf = await pdfjsLib.getDocument({ data: bytes }).promise
        if (cancelled) return

        pdfRef.current = pdf
        setNumPages(pdf.numPages)
        await renderPage(pdf, 1)
        if (!cancelled) onLoaded()
      } catch (err) {
        if (!cancelled) {
          onError(err instanceof Error ? err.message : String(err))
        }
      }
    }

    async function renderPage(pdf: any, pageNum: number) {
      if (!containerRef.current) return
      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale: 1.5 })

      const existing = containerRef.current.querySelector('canvas')
      if (existing) existing.remove()

      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      canvas.style.maxWidth = '100%'
      canvas.style.height = 'auto'
      containerRef.current.appendChild(canvas)

      const context = canvas.getContext('2d')
      await page.render({ canvasContext: context!, viewport }).promise
    }

    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath])

  useEffect(() => {
    if (!pdfRef.current || currentPage < 1) return
    let cancelled = false

    async function render() {
      if (!containerRef.current || cancelled) return
      const page = await pdfRef.current.getPage(currentPage)
      const viewport = page.getViewport({ scale: 1.5 })

      const existing = containerRef.current.querySelector('canvas')
      if (existing) existing.remove()

      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      canvas.style.maxWidth = '100%'
      canvas.style.height = 'auto'
      containerRef.current.appendChild(canvas)

      const context = canvas.getContext('2d')
      await page.render({ canvasContext: context!, viewport }).promise
    }

    render()
    return () => { cancelled = true }
  }, [currentPage])

  return (
    <div className="h-full flex flex-col">
      {numPages > 0 && (
        <div className="flex items-center justify-center gap-3 px-4 py-2 border-b border-border-light/50 shrink-0">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            className="px-3 py-1 rounded-lg text-[11px] font-bold bg-surface-secondary/60 disabled:opacity-30 hover:bg-surface-secondary transition-all"
          >
            ‹
          </button>
          <span className="text-[11px] font-bold text-text-secondary">
            {currentPage} / {numPages}
          </span>
          <button
            onClick={() => setCurrentPage(Math.min(numPages, currentPage + 1))}
            disabled={currentPage >= numPages}
            className="px-3 py-1 rounded-lg text-[11px] font-bold bg-surface-secondary/60 disabled:opacity-30 hover:bg-surface-secondary transition-all"
          >
            ›
          </button>
        </div>
      )}
      <div ref={containerRef} className="flex-1 overflow-auto flex items-start justify-center p-4" />
    </div>
  )
}
