import React, { useMemo, memo, useState, useCallback, useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown, { type Components } from 'react-markdown'
import type { PluggableList } from 'unified'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkCjkFriendly from 'remark-cjk-friendly'
import remarkAlert from 'remark-github-blockquote-alert'
import rehypeRaw from 'rehype-raw'
import rehypeKatex from 'rehype-katex'
// MathJax alternative: import rehypeMathjax from 'rehype-mathjax'
import 'katex/dist/katex.min.css'
import 'remark-github-blockquote-alert/alert.css'
import { Copy, Check, Download, X, Table as TableIcon, FileSpreadsheet, Code } from 'lucide-react'
import { MermaidBlock } from './MermaidBlock'
import { HtmlPreviewBlock } from './HtmlPreviewBlock'
import { CodeRunBlock } from './CodeRunBlock'
import { PlantUMLBlock } from './PlantUMLBlock'
import { CodeEditorBlock } from './CodeEditorBlock'
import { Hyperlink } from './Hyperlink'
import { CitationTooltip } from './CitationTooltip'
import { highlightInWorker } from './shikiWorker'
import * as XLSX from 'xlsx'
import { rehypeHeadingIds, remarkDisableConstructs, rehypeScalableSvg } from './plugins'

const MAX_COLLAPSED_HEIGHT = 400

// ============== Theme ==============
function getTheme(): 'github-dark' | 'github-light' {
  return document.documentElement.classList.contains('dark') ? 'github-dark' : 'github-light'
}



// ============== Language color map for badges ==============
const LANG_COLORS: Record<string, string> = {
  javascript: '#f7df1e', typescript: '#3178c6', python: '#3776ab', css: '#1572b6',
  html: '#e34f26', json: '#292929', bash: '#4eaa25', shell: '#4eaa25',
  sql: '#e38c00', rust: '#dea584', go: '#00add8', java: '#b07219',
  ruby: '#cc342d', php: '#777bb4', c: '#a8b9cc', cpp: '#00599c',
  yaml: '#6d8a9e', markdown: '#083fa1', xml: '#0060ac', dockerfile: '#2496ed',
  graphql: '#e10098', plaintext: '#8e8e8e', text: '#8e8e8e',
}

// ============== Image Viewer with Lightbox ==============
function ImageViewer({ src, alt }: { src?: string; alt?: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    if (!src) return
    navigator.clipboard.writeText(src).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [src])

  const handleDownload = useCallback(() => {
    if (!src) return
    const a = document.createElement('a')
    a.href = src
    a.download = alt || 'image'
    a.click()
  }, [src, alt])

  return (
    <>
      <img
        src={src}
        alt={alt || ''}
        className="max-w-full h-auto max-h-[400px] rounded-lg border border-[var(--color-border)] shadow-sm object-contain my-4 cursor-pointer hover:opacity-90 transition-opacity"
        loading="lazy"
        onClick={() => setOpen(true)}
      />
      {open && (
        <div
          className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setOpen(false)}
        >
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-black/50 to-transparent">
            <span className="text-sm text-white/70 truncate max-w-[60%]">{alt || src?.split('/').pop() || 'Image'}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); handleCopy() }}
                className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
                title={t('chat.copy.copy')}
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleDownload() }}
                className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
                title="Download"
              >
                <Download size={18} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setOpen(false) }}
                className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors ml-2"
              >
                <X size={20} />
              </button>
            </div>
          </div>
          <img
            src={src}
            alt={alt || ''}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}

// ============== Inline Code ==============
function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code className="bg-[var(--color-surface-secondary)] text-[var(--color-accent)] px-1.5 py-0.5 rounded text-[0.875em] font-mono">
      {children}
    </code>
  )
}

// ============== Code Block ==============
interface CodeBlockProps {
  className?: string
  children: ReactNode
}

function CodeBlock({ className, children }: CodeBlockProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [editing, setEditing] = useState(false)

  const language = className?.replace('language-', '') || ''
  const code = String(children).replace(/\n$/, '')

  if (language === 'mermaid') return <MermaidBlock code={code} />
  if (language === 'html') return <HtmlPreviewBlock code={code} />
  if (language === 'plantuml' || language === 'puml' || language === 'dot' || language === 'graphviz') {
    return <PlantUMLBlock code={code} />
  }
  if (language === 'javascript' || language === 'typescript' || language === 'js' || language === 'ts' || language === 'python' || language === 'py') {
    return <CodeRunBlock code={code} language={language} />
  }

  useEffect(() => {
    let cancelled = false
    const theme = getTheme()
    const reqId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    highlightInWorker({ id: reqId, code, language: language || 'text', theme })
      .then((response) => {
        if (!cancelled) setHighlightedHtml(response.html)
      })
      .catch(() => {
        if (!cancelled) setHighlightedHtml(null)
      })

    return () => { cancelled = true }
  }, [code, language])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [code])

  const lineCount = code.split('\n').length

  return (
    <div className="code-block-wrapper my-3 rounded-xl overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--color-surface-secondary)] border-b border-[var(--color-border)]">
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">
          <span
            className="w-2.5 h-2.5 rounded-sm inline-block"
            style={{ backgroundColor: LANG_COLORS[language] || '#8e8e8e' }}
          />
          {language || t('chat.code.text')}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setEditing(!editing)}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] rounded-md hover:bg-[var(--color-border)] transition-colors"
          >
            <Code size={12} />
            {editing ? t('chat.code.view') || 'View' : t('chat.code.edit') || 'Edit'}
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] rounded-md hover:bg-[var(--color-border)] transition-colors"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? t('chat.copy.copied') : t('chat.copy.copy')}
          </button>
        </div>
      </div>
      <div
        className={`overflow-x-auto transition-all ${!expanded ? 'overflow-hidden' : ''}`}
        style={!expanded ? { maxHeight: MAX_COLLAPSED_HEIGHT } : undefined}
      >
        {editing ? (
          <CodeEditorBlock code={code} language={language} />
        ) : highlightedHtml ? (
          <div
            className="px-4 py-3 text-[13px] leading-relaxed [&_.shiki]:!bg-transparent"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        ) : (
          <pre className="px-4 py-3 text-[13px] font-mono leading-relaxed overflow-x-auto">
            <code>{code}</code>
          </pre>
        )}
      </div>
      {!expanded && (
        <div className="relative h-16 -mt-16 bg-gradient-to-t from-[var(--color-surface)] to-transparent pointer-events-none" />
      )}
      {lineCount > 8 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full py-2 text-[11px] font-bold text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] bg-[var(--color-surface-secondary)] border-t border-[var(--color-border)] transition-colors flex items-center justify-center gap-1"
        >
          {expanded ? '▲ Collapse' : `▼ ${lineCount} lines`}
        </button>
      )}
    </div>
  )
}

// ============== Table with toolbar ==============
function TableWrapper({ children, node }: { children: ReactNode; node?: any }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const extractMarkdown = useCallback(() => {
    const rows = (node?.children || []).filter((c: any) => c.tagName === 'thead' || c.tagName === 'tbody')
    const lines: string[] = []
    for (const row of rows) {
      for (const tr of row?.children || []) {
        const cells = (tr?.children || []).map((td: any) => {
          return td?.children?.map((c: any) => c?.value || '').join('') || ''
        })
        lines.push(`| ${cells.join(' | ')} |`)
      }
    }
    return lines.join('\n')
  }, [node])

  const handleCopy = useCallback(() => {
    const md = extractMarkdown()
    if (md) {
      navigator.clipboard.writeText(md).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }, [extractMarkdown])

  const handleExportExcel = useCallback(() => {
    const rows: string[][] = []
    const processRow = (tr: any) => {
      const cells = (tr.children || [])
        .filter((c: any) => c.tagName === 'th' || c.tagName === 'td')
        .map((c: any) => {
          return c.children?.map((child: any) => child.value || '').join('') || ''
        })
      if (cells.length > 0) rows.push(cells)
    }
    for (const child of node?.children || []) {
      if (child.tagName === 'thead' || child.tagName === 'tbody') {
        for (const tr of child.children || []) {
          processRow(tr)
        }
      }
    }
    if (rows.length > 0) {
      const ws = XLSX.utils.aoa_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
      XLSX.writeFile(wb, 'table-export.xlsx')
    }
  }, [node])

  return (
    <div className="relative group my-3">
      <div className="overflow-x-auto border border-[var(--color-border)] rounded-xl">
        <table className="min-w-full border-collapse">{children}</table>
      </div>
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
        <button
          onClick={handleCopy}
          className="p-1.5 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] shadow-sm transition-all"
          title={t('common.copy') || 'Copy table'}
        >
          {copied ? <Check size={14} /> : <TableIcon size={14} />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleExportExcel() }}
          className="p-1.5 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] shadow-sm transition-all"
          title="Export Excel"
        >
          <FileSpreadsheet size={14} />
        </button>
      </div>
    </div>
  )
}

// ============== shouldUseDocumentLayout ==============
export function shouldUseDocumentLayout(content: string): boolean {
  if (!content) return false
  const hasCodeFence = content.includes('```')
  const hasHeading = /^#{1,6}\s/m.test(content)
  const hasBlockElements = /^\s*[-*>]|\|\s|^\d+\.\s/m.test(content)
  const lineCount = content.split('\n').length
  const paragraphCount = content.split(/\n\s*\n/).length
  return hasCodeFence || hasHeading || (hasBlockElements && paragraphCount >= 2) || lineCount >= 8
}

// ============== Main Markdown component ==============
interface MarkdownProps {
  children: string
  className?: string
  variant?: 'default' | 'document' | 'compact'
}

function MarkdownInner({ children, className = '', variant = 'default' }: MarkdownProps) {
  const isDocument = variant === 'document' || (variant === 'default' && shouldUseDocumentLayout(children))

  const components = useMemo<Partial<Components>>(() => ({
    code({ className, children }) {
      const isInline = !String(children).includes('\n')
      if (isInline) return <InlineCode>{children}</InlineCode>
      return <CodeBlock className={className}>{children}</CodeBlock>
    },

    table({ children, node }) {
      return <TableWrapper node={node}>{children}</TableWrapper>
    },
    thead({ children }) {
      return <thead className="bg-[var(--color-surface-secondary)]">{children}</thead>
    },
    th({ children }) {
      return (
        <th className="px-4 py-2.5 text-left text-[13px] font-bold text-[var(--color-text)] border-b border-[var(--color-border)] whitespace-nowrap">
          {children}
        </th>
      )
    },
    td({ children }) {
      return (
        <td className="px-4 py-2.5 text-[13px] text-[var(--color-text-secondary)] border-b border-[var(--color-border)]">
          {children}
        </td>
      )
    },

    a({ href, children }) {
      const childrenArray = React.Children.toArray(children)
      const hasSup = childrenArray.some(
        (child: any) => child?.type === 'sup'
      )

      if (hasSup) {
        return (
          <CitationTooltip citation={{ title: href, url: href, content: '' }}>
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--color-accent)] hover:underline underline-offset-2"
            >
              {children}
            </a>
          </CitationTooltip>
        )
      }

      return <Hyperlink href={href || '#'}>{children}</Hyperlink>
    },

    img({ src, alt }) {
      return <ImageViewer src={src} alt={alt} />
    },

    p(nodeProps) {
      const { children, ...rest } = nodeProps
      const hasImage = (rest as any).node?.children?.some((child: any) => child.tagName === 'img')
      if (hasImage) return <div className="my-2">{children}</div>
      return <p className="my-2 leading-relaxed">{children}</p>
    },
  }), [])

  const proseClass = `prose max-w-none break-words ${isDocument ? 'prose-base leading-relaxed' : 'prose-sm'} dark:prose-invert ${className}`

  const remarkPlugins = useMemo<PluggableList>(() => [
    remarkGfm,
    [remarkMath, { singleDollarTextMath: true }],
    remarkCjkFriendly,
    remarkAlert,
    [remarkDisableConstructs, ['codeIndented']],
  ], [])

  const rehypePlugins = useMemo<PluggableList>(() => [
    rehypeRaw,
    rehypeKatex,
    rehypeScalableSvg,
    [rehypeHeadingIds, { prefix: `h-${Math.random().toString(36).slice(2, 8)}-` }],
  ], [])

  return (
    <div className={proseClass}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

export const Markdown = memo(MarkdownInner)
