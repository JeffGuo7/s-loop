import { useEffect, useState } from 'react'

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

/** Find child elements by local name, ignoring XML namespace prefixes. */
function childrenByLocalName(parent: Element, name: string): Element[] {
  const result: Element[] = []
  for (let i = 0; i < parent.children.length; i++) {
    if (parent.children[i].localName === name) result.push(parent.children[i])
  }
  return result
}

/** Recursively find descendant elements by local name. */
function queryByLocalName(root: Element, name: string): Element[] {
  const result: Element[] = []
  const stack = [...Array.from(root.children)]
  while (stack.length > 0) {
    const el = stack.pop()!
    if (el.localName === name) result.push(el)
    for (let i = 0; i < el.children.length; i++) stack.push(el.children[i])
  }
  return result
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
      const fontName = rPr.getAttribute('typeface') || rPr.querySelector('*[local-name()="latin"]')?.getAttribute('typeface')
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
  const tables: TableCell[][][] = []

  // --- Text shapes ---
  for (const txBody of queryByLocalName(doc.documentElement, 'txBody')) {
    for (const pEl of childrenByLocalName(txBody, 'p')) {
      const runs: FormattedRun[] = []
      for (const rEl of childrenByLocalName(pEl, 'r')) {
        const rPr = childrenByLocalName(rEl, 'rPr')[0] || null
        const tEls = childrenByLocalName(rEl, 't')
        const texts = tEls.map((t) => t.textContent || '')
        runs.push(...parseRuns(rPr, texts))
      }
      if (runs.length > 0) paragraphs.push(runs)
    }
  }

  // --- Tables ---
  for (const tbl of queryByLocalName(doc.documentElement, 'tbl')) {
    const table: TableCell[][] = []
    for (const row of childrenByLocalName(tbl, 'tr')) {
      const cells: TableCell[] = []
      for (const tc of childrenByLocalName(row, 'tc')) {
        const cell: TableCell = { runs: [] }
        const rowspan = tc.getAttribute('rowSpan') || tc.getAttribute('rowspan')
        const colspan = tc.getAttribute('gridSpan') || tc.getAttribute('gridspan')
        if (rowspan) cell.rowspan = parseInt(rowspan, 10)
        if (colspan) cell.colspan = parseInt(colspan, 10)
        for (const txBody of childrenByLocalName(tc, 'txBody')) {
          const cellRuns: FormattedRun[][] = []
          for (const pEl of childrenByLocalName(txBody, 'p')) {
            const runs: FormattedRun[] = []
            for (const rEl of childrenByLocalName(pEl, 'r')) {
              const rPr = childrenByLocalName(rEl, 'rPr')[0] || null
              const tEls = childrenByLocalName(rEl, 't')
              const texts = tEls.map((t) => t.textContent || '')
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

  return { paragraphs, images: [], tables }
}

function uint8ToBase64(bytes: Uint8Array): string {
  const chunks: string[] = []
  for (let i = 0; i < bytes.length; i += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)))
  }
  return btoa(chunks.join(''))
}

async function loadSlideImages(
  relsXml: string | null,
  zip: any,
): Promise<SlideImage[]> {
  const images: SlideImage[] = []
  if (!relsXml) return images

  const parser = new DOMParser()
  const relsDoc = parser.parseFromString(relsXml, 'text/xml')
  const relsRoot = relsDoc.documentElement
  for (const rel of childrenByLocalName(relsRoot, 'Relationship')) {
    const type = rel.getAttribute('Type') || ''
    if (!type.includes('image')) continue
    const target = rel.getAttribute('Target') || ''
    const mediaName = target.split('/').pop() || ''
    const fullPath = `ppt/media/${mediaName}`
    const file = zip.file(fullPath)
    if (!file) continue

    const blob = await file.async('uint8array')
    const ext = fullPath.split('.').pop() || 'png'
    const mimeMap: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', bmp: 'image/bmp', webp: 'image/webp' }
    const mime = mimeMap[ext] || 'image/png'
    images.push({ dataUrl: `data:${mime};base64,${uint8ToBase64(blob)}`, ext })
  }
  return images
}

export function PptxPreview({ filePath, onLoaded, onError }: PptxPreviewProps) {
  const [slides, setSlides] = useState<SlideData[]>([])
  const [currentSlide, setCurrentSlide] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setCurrentSlide(0)

    async function load() {
      try {
        const JSZip = (await import('jszip')).default
        const { invoke } = await import('@tauri-apps/api/core')
        const base64 = await invoke<string>('read_file_base64', { path: filePath })
        const binaryString = atob(base64)
        const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0))
        const zip = await JSZip.loadAsync(bytes)

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

          const relsPath = slidePath.replace('slides/', 'slides/_rels/') + '.rels'
          const relsFile = zip.file(relsPath)
          const relsXml = relsFile ? await relsFile.async('text') : null
          content.images = await loadSlideImages(relsXml, zip)

          slideData.push({ index: slideFiles.indexOf(slidePath) + 1, content })
        }

        if (!cancelled) {
          setSlides(slideData)
          setLoading(false)
          onLoaded()
        }
      } catch (err) {
        if (!cancelled) {
          setLoading(false)
          onError(err instanceof Error ? err.message : String(err))
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [filePath])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--color-surface)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
          <span className="text-[12px] text-text-tertiary">Loading slides...</span>
        </div>
      </div>
    )
  }

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
          <div className="p-8 sm:p-12 min-h-[300px]">
            {current.content.images.length > 0 && (
              <div className="flex flex-wrap gap-4 mb-6 justify-center">
                {current.content.images.map((img, i) => (
                  <img key={i} src={img.dataUrl} alt={`Slide image ${i + 1}`}
                    className="max-w-full h-auto rounded-lg shadow-sm border border-border-light/50 max-h-[300px] object-contain" />
                ))}
              </div>
            )}

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
                                {para.map((r, ri) => renderRuns([r], `rt-${ti}-${ri}-${pi}-${ri}`))}
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
