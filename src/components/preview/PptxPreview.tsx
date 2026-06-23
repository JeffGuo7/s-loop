import { useEffect, useState } from 'react'

interface PptxPreviewProps {
  filePath: string
  onLoaded: () => void
  onError: (msg: string) => void
}

interface SlideData {
  index: number
  texts: string[]
}

export function PptxPreview({ filePath, onLoaded, onError }: PptxPreviewProps) {
  const [slides, setSlides] = useState<SlideData[]>([])
  const [currentSlide, setCurrentSlide] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const JSZip = (await import('jszip')).default
        const { invoke } = await import('@tauri-apps/api/core')
        const base64 = await invoke<string>('read_file_base64', { path: filePath })

        const binaryString = atob(base64)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }

        const zip = await JSZip.loadAsync(bytes)

        const slideFiles: string[] = []
        zip.forEach((relativePath) => {
          const match = relativePath.match(/^ppt\/slides\/slide(\d+)\.xml$/)
          if (match) slideFiles.push(relativePath)
        })

        slideFiles.sort((a, b) => {
          const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0')
          const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0')
          return numA - numB
        })

        const slideData: SlideData[] = []
        for (let i = 0; i < slideFiles.length; i++) {
          const xmlContent = await zip.file(slideFiles[i])!.async('text')
          const textMatches = xmlContent.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) || []
          const texts = textMatches
            .map(m => m.replace(/<a:t[^>]*>/, '').replace(/<\/a:t>/, ''))
            .filter(t => t.trim())

          slideData.push({ index: i + 1, texts })
        }

        if (!cancelled) {
          setSlides(slideData)
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

  if (slides.length === 0) return null

  const current = slides[currentSlide]

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-center gap-3 px-4 py-2 border-b border-border-light/50 shrink-0">
        <button
          onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
          disabled={currentSlide <= 0}
          className="px-3 py-1 rounded-lg text-[11px] font-bold bg-surface-secondary/60 disabled:opacity-30 hover:bg-surface-secondary transition-all"
        >
          ‹
        </button>
        <span className="text-[11px] font-bold text-text-secondary">
          Slide {current.index} / {slides.length}
        </span>
        <button
          onClick={() => setCurrentSlide(Math.min(slides.length - 1, currentSlide + 1))}
          disabled={currentSlide >= slides.length - 1}
          className="px-3 py-1 rounded-lg text-[11px] font-bold bg-surface-secondary/60 disabled:opacity-30 hover:bg-surface-secondary transition-all"
        >
          ›
        </button>
      </div>

      <div className="flex-1 overflow-auto flex items-center justify-center p-6">
        <div className="w-full max-w-lg bg-white dark:bg-white/5 rounded-2xl shadow-xl p-8 border border-border-light/30 min-h-[200px]">
          {current.texts.length > 0 ? (
            current.texts.map((text, i) => (
              <p key={i} className="text-[14px] leading-relaxed text-text mb-2">{text}</p>
            ))
          ) : (
            <p className="text-[12px] text-text-quaternary italic">(Empty slide)</p>
          )}
        </div>
      </div>
    </div>
  )
}
