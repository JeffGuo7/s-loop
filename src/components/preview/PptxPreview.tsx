import { useEffect, useState, useRef } from 'react'

interface PptxPreviewProps {
  filePath: string
  onLoaded: () => void
  onError: (msg: string) => void
}

interface SlideImage {
  dataUrl: string
  ext: string
}

interface FormattedRun {
  text: string
  bold?: boolean
  italic?: boolean
  fontSize?: number
  color?: string
  fontName?: string
}

interface TableCell {
  runs: FormattedRun[][]
  rowspan?: number
  colspan?: number
}

interface SlideContent {
  paragraphs: FormattedRun[][]
  images: SlideImage[]
  tables: TableCell[][][]
}

interface SlideData {
  index: number
  content: SlideContent
}

function parseRuns(rPr: Element | null, texts: string[]): FormattedRun[] {
  const runs: FormattedRun[] = []
  for (const t of texts) {
    const trimmed = t.trim()
    if (!trimmed) continue
    const run: FormattedRun = { text: trimmed }
    if (rPr) {
      run.bold = rPr.getAttribute('b') === '1'
      run.italic = rPr.getAttribute('i') === '1'
      const sz = rPr.getAttribute('sz')
      if (sz) run.fontSize = parseInt(sz, 10) / 100
      const fontName = rPr.getAttribute('typeface') || rPr.querySelector('a:latin')?.getAttribute('typeface')
      if (fontName) run.fontName = fontName
    }
    runs.push(run)
  }
  return runs
}

function renderRuns(runs: FormattedRun[], key: string, maxFont = 24) {
  return (
    <span key={key}>
      {runs.map((r, i) => (
        <span
          key={i}
          style={{
            fontWeight: r.bold ? 700 : 400,
            fontStyle: r.italic ? 'italic' : undefined,
            fontSize: r.fontSize ? Math.min(r.fontSize, maxFont) : undefined,
            color: r.color || undefined,
            fontFamily: r.fontName || undefined,
          }}
        >
          {r.text}
        </span>
      ))}
    </span>
  )
}

function slideXmlToContent(xml: string): SlideContent {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')

  const paragraphs: FormattedRun[][] = []
  const images: SlideImage[] = []
  const tables: TableCell[][][] = []

  // --- Text shapes ---
  const txBodies = doc.querySelectorAll('p\\:sp p\\:txBody, sp txBody')
  for (const body of txBodies) {
    const pElements = body.querySelectorAll('a\\:p, p')
    for (const pEl of pElements) {
      const runs: FormattedRun[] = []
      const rElements = pEl.querySelectorAll('a\\:r, r')
      for (const rEl of rElements) {
        const rPr = rEl.querySelector('a\\:rPr, rPr')
        const tElements = rEl.querySelectorAll('a\\:t, t')
        const texts: string[] = []
        for (const t of tElements) texts.push(t.textContent || '')
        runs.push(...parseRuns(rPr, texts))
      }
      if (runs.length > 0) paragraphs.push(runs)
    }
  }

  // --- Tables ---
  const tblElements = doc.querySelectorAll('a\\:tbl, tbl')
  for (const tbl of tblElements) {
    const table: TableCell[][] = []
    const rows = tbl.querySelectorAll('a\\:tr, tr')
    for (const row of rows) {
      const cells: TableCell[] = []
      const tcElements = row.querySelectorAll('a\\:tc, tc')
      for (const tc of tcElements) {
        const cell: TableCell = { runs: [] }
        const rowspan = tc.getAttribute('rowSpan') || tc.getAttribute('rowspan')
        const colspan = tc.getAttribute('gridSpan') || tc.getAttribute('gridspan')
        if (rowspan) cell.rowspan = parseInt(rowspan, 10)
        if (colspan) cell.colspan = parseInt(colspan, 10)
        const txBodies = tc.querySelectorAll('a\\:txBody, txBody')
        for (const body of txBodies) {
          const pElements = body.querySelectorAll('a\\:p, p')
          const cellRuns: FormattedRun[][] = []
          for (const pEl of pElements) {
            const runs: FormattedRun[] = []
            const rElements = pEl.querySelectorAll('a\\:r, r')
            for (const rEl of rElements) {
              const rPr = rEl.querySelector('a\\:rPr, rPr')
              const tElements = rEl.querySelectorAll('a\\:t, t')
              const texts: string[] = []
              for (const t of tElements) texts.push(t.textContent || '')
              runs.push(...parseRuns(rPr, texts))
            }
            if (runs.length > 0) cellRuns.push(runs)
          }
          cell.runs = cellRuns
        }
        cells.push(cell)
      }
      table.push(cells)
    }
    tables.push(table)
  }

  return { paragraphs, images, tables }
}

async function loadSlideImages(
  relsXml: string | null,
  zip: any,
): Promise<SlideImage[]> {
  const images: SlideImage[] = []
  if (!relsXml) return images

  const parser = new DOMParser()
  const relsDoc = parser.parseFromString(relsXml, 'text/xml')

  // Find image relationships: <Relationship Id="rId2" Target="../media/image1.png" Type="...image"...>
  const relElements = relsDoc.querySelectorAll('Relationship')
  for (const rel of relElements) {
    const type = rel.getAttribute('Type') || ''
    if (!type.includes('image')) continue
    const target = rel.getAttribute('Target') || ''
    const mediaPath = target.replace(/^.*?\/(media\/.+)$/, '$1')
    const fullPath = `ppt/${mediaPath}`
    const file = zip.file(fullPath)
    if (!file) continue

    const blob = await file.async('uint8array')
    const ext = fullPath.split('.').pop() || 'png'
    const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'gif' ? 'image/gif' : ext === 'svg' ? 'image/svg+xml' : 'image/png'
    const bytes = new Uint8Array(blob)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    const dataUrl = `data:${mime};base64,${btoa(binary)}`
    images.push({ dataUrl, ext })
  }

  return images
}

export function PptxPreview({ filePath, onLoaded, onError }: PptxPreviewProps) {
  const [slides, setSlides] = useState<SlideData[]>([])
  const [currentSlide, setCurrentSlide] = useState(0)
  const loaded = useRef(false)

  useEffect(() => {
    if (loaded.current) return
    let cancelled = false
    loaded.current = true

    async function load() {
      try {
        const JSZip = (await import('jszip')).default
        const { invoke } = await import('@tauri-apps/api/core')
        const base64 = await invoke<string>('read_file_base64', { path: filePath })
        const binaryString = atob(base64)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i)
        const zip = await JSZip.loadAsync(bytes)

        // Find slide files
        const slideFiles: string[] = []
        zip.forEach((relativePath: string) => {
          if (/^ppt\/slides\/slide\d+\.xml$/.test(relativePath)) slideFiles.push(relativePath)
        })
        slideFiles.sort((a: string, b: string) => {
          const na = parseInt(a.match(/slide(\d+)/)![1])
          const nb = parseInt(b.match(/slide(\d+)/)![1])
          return na - nb
        })

        const slideData: SlideData[] = []
        for (const slidePath of slideFiles) {
          const xmlContent = await zip.file(slidePath)!.async('text')
          const content = slideXmlToContent(xmlContent)

          // Look for rels file
          const relsPath = slidePath.replace('slides/', 'slides/_rels/') + '.rels'
          const relsFile = zip.file(relsPath)
          const relsXml = relsFile ? await relsFile.async('text') : null

          // Also try to find images in slide: parse slide content for blip refs
          content.images = await loadSlideImages(relsXml, zip)

          // Try to extract images from the slide XML directly (additional fallback)
          const doc = new DOMParser().parseFromString(xmlContent, 'text/xml')
          const blipElements = doc.querySelectorAll('a\\:blip, blip')
          for (const blip of blipElements) {
            const embed = blip.getAttribute('r:embed') || blip.getAttribute('embed')
            if (!embed) continue
            // Check if we already got this from rels
            const alreadyLoaded = content.images.length > 0
            if (!alreadyLoaded && relsXml) {
              const relsDoc = new DOMParser().parseFromString(relsXml, 'text/xml')
              const rel = relsDoc.querySelector(`Relationship[Id="${embed}"]`)
              if (rel) {
                const target = rel.getAttribute('Target') || ''
                const mediaPath = target.replace(/^.*?\/(media\/.+)$/, '$1')
                const fullPath = `ppt/${mediaPath}`
                const file = zip.file(fullPath)
                if (file) {
                  const blob = await file.async('uint8array')
                  const ext = fullPath.split('.').pop() || 'png'
                  const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'
                  let binary = ''
                  for (let i = 0; i < blob.length; i++) binary += String.fromCharCode(blob[i])
                  const dataUrl = `data:${mime};base64,${btoa(binary)}`
                  content.images.push({ dataUrl, ext })
                }
              }
            }
          }

          slideData.push({ index: slideFiles.indexOf(slidePath) + 1, content })
        }

        if (!cancelled) { setSlides(slideData); onLoaded() }
      } catch (err) {
        if (!cancelled) onError(err instanceof Error ? err.message : String(err))
      }
    }

    load()
    return () => { cancelled = true }
  }, [filePath])

  if (slides.length === 0) return null
  const current = slides[currentSlide]

  return (
    <div className="h-full flex flex-col bg-[var(--color-surface)]">
      {/* Slide navigation */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-border-light/50 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
            disabled={currentSlide <= 0}
            className="px-3 py-1 rounded-lg text-[11px] font-bold bg-surface-secondary/50 disabled:opacity-25 hover:bg-surface-secondary transition-all">
            ‹ Prev
          </button>
          <span className="text-[11px] font-bold text-text-secondary tabular-nums">
            {current.index} / {slides.length}
          </span>
          <button onClick={() => setCurrentSlide(Math.min(slides.length - 1, currentSlide + 1))}
            disabled={currentSlide >= slides.length - 1}
            className="px-3 py-1 rounded-lg text-[11px] font-bold bg-surface-secondary/50 disabled:opacity-25 hover:bg-surface-secondary transition-all">
            Next ›
          </button>
        </div>
        <span className="text-[10px] text-text-quaternary">{slides.length} slides</span>
      </div>

      {/* Slide canvas */}
      <div className="flex-1 overflow-auto flex items-start justify-center p-6 sm:p-10">
        <div className="w-full max-w-[720px] bg-white dark:bg-white/5 rounded-xl shadow-lg border border-border-light/30 overflow-hidden">
          {/* Slide content */}
          <div className="p-8 sm:p-12 min-h-[300px]">
            {/* Images */}
            {current.content.images.length > 0 && (
              <div className="flex flex-wrap gap-4 mb-6 justify-center">
                {current.content.images.map((img, i) => (
                  <img key={i} src={img.dataUrl} alt={`Slide image ${i + 1}`}
                    className="max-w-full h-auto rounded-lg shadow-sm border border-border-light/50 max-h-[300px] object-contain" />
                ))}
              </div>
            )}

            {/* Tables */}
            {current.content.tables.map((table, ti) => (
              <div key={ti} className="mb-6 overflow-x-auto">
                <table className="w-full border-collapse rounded-lg overflow-hidden text-[12px]">
                  <tbody>
                    {table.map((row, ri) => (
                      <tr key={ri} className={ri % 2 === 0 ? 'bg-surface-secondary/30' : ''}>
                        {row.map((cell, ci) => (
                          <td key={ci}
                            colSpan={cell.colspan || 1}
                            rowSpan={cell.rowspan || 1}
                            className="border border-border-light/50 px-3 py-2 align-top"
                          >
                            {cell.runs.map((para, pi) => (
                              <p key={pi} className={pi < cell.runs.length - 1 ? 'mb-1' : ''}>
                                {para.map((r, ri) => renderRuns([r], `r-${ri}`, 16))}
                              </p>
                            ))}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            {/* Paragraphs */}
            {current.content.paragraphs.length > 0 ? (
              <div className="space-y-3">
                {current.content.paragraphs.map((runs, i) => (
                  <p key={i} className="text-[13px] leading-relaxed text-text">
                    {renderRuns(runs, `p-${i}`)}
                  </p>
                ))}
              </div>
            ) : (
              !current.content.images.length && !current.content.tables.length && (
                <p className="text-[12px] text-text-quaternary italic text-center py-12">(Empty slide)</p>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
