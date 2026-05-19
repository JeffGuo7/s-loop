import { useMemo, useCallback, useState, useRef, useEffect, type ReactNode } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'

interface MarkdownProps {
  children: string
  className?: string
  variant?: 'default' | 'document' | 'compact'
}

interface CodeBlock {
  lang: string
  code: string
}

const PROSE_BASE = 'prose max-w-none break-words'
const PROSE_VARIANTS = {
  default: 'prose-sm',
  document: 'prose-base leading-relaxed',
  compact: 'prose-sm text-[var(--color-text-secondary)]',
}

function CodeBlockComponent({ lang, code }: CodeBlock) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      timerRef.current = setTimeout(() => setCopied(false), 1500)
    })
  }, [code])

  const highlighted = useMemo(() => {
    try {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value
      }
      return hljs.highlightAuto(code).value
    } catch {
      return code.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    }
  }, [lang, code])

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span>{lang || 'text'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] hover:bg-[var(--color-border)] transition-colors"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <div className="code-block-content">
        <pre>
          <code
            className={lang ? `language-${lang}` : ''}
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </pre>
      </div>
    </div>
  )
}

function InlineCode({ children }: { children: string }) {
  return (
    <code className="bg-[var(--color-surface-secondary)] text-[var(--color-accent)] px-1.5 py-0.5 rounded text-[0.875em] font-mono">
      {children}
    </code>
  )
}

export function shouldUseDocumentLayout(content: string): boolean {
  if (!content) return false
  const hasCodeFence = content.includes('```')
  const hasHeading = /^#{1,6}\s/m.test(content)
  const hasBlockElements = /^\s*[-*>]|\|\s|^\d+\.\s/m.test(content)
  const lineCount = content.split('\n').length
  const paragraphCount = content.split(/\n\s*\n/).length
  return hasCodeFence || hasHeading || (hasBlockElements && paragraphCount >= 2) || lineCount >= 8
}

const customRenderer = {
  code({ text, lang }: { text: string; lang?: string }) {
    return `<!--CODE_BLOCK:${lang || ''}:${text.replace(/<!--/g, '\\u003C!--')}-->`
  },
  codespan({ text }: { text: string }) {
    return `<!--INLINE_CODE:${text}-->`
  },
  image({ href, text }: { href: string; text: string }) {
    // Don't render images — show as a text reference instead.
    // Prevents broken local-path images (C:\...) and unwanted external images.
    const label = text || href || 'image'
    return `[img: ${label}](${href})`
  },
}

marked.use({ renderer: customRenderer, breaks: true, gfm: true })

function parseRenderedContent(html: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = []
  const codeBlockRegex = /<!--CODE_BLOCK:([^:]*):([\s\S]*?)-->/g
  const inlineCodeRegex = /<!--INLINE_CODE:([^}]*?)-->/g

  const allReplacements: { index: number; end: number; element: ReactNode }[] = []

  let match: RegExpExecArray | null
  codeBlockRegex.lastIndex = 0
  while ((match = codeBlockRegex.exec(html)) !== null) {
    allReplacements.push({
      index: match.index,
      end: match.index + match[0].length,
      element: (
        <CodeBlockComponent
          key={`${keyPrefix}-cb-${match.index}`}
          lang={match[1]}
          code={match[2].replace(/\\u003C!--/g, '<!--')}
        />
      ),
    })
  }

  inlineCodeRegex.lastIndex = 0
  while ((match = inlineCodeRegex.exec(html)) !== null) {
    allReplacements.push({
      index: match.index,
      end: match.index + match[0].length,
      element: <InlineCode key={`${keyPrefix}-ic-${match.index}`}>{match[1]}</InlineCode>,
    })
  }

  allReplacements.sort((a, b) => a.index - b.index)

  let lastIndex = 0
  for (const rep of allReplacements) {
    if (rep.index > lastIndex) {
      const segment = html.slice(lastIndex, rep.index)
      const sanitized = DOMPurify.sanitize(segment)
      parts.push(
        <span
          key={`${keyPrefix}-t-${lastIndex}`}
          dangerouslySetInnerHTML={{ __html: sanitized }}
        />
      )
    }
    parts.push(rep.element)
    lastIndex = rep.end
  }

  if (lastIndex < html.length) {
    const sanitized = DOMPurify.sanitize(html.slice(lastIndex))
    parts.push(
      <span
        key={`${keyPrefix}-t-end`}
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
    )
  }

  return parts
}

export function Markdown({ children, className = '', variant = 'default' }: MarkdownProps) {
  const isDocument = variant === 'document' || (variant === 'default' && shouldUseDocumentLayout(children))

  const elements = useMemo(() => {
    const html = marked.parse(children) as string
    return parseRenderedContent(html, 'md')
  }, [children])

  const proseClass = `${PROSE_BASE} ${PROSE_VARIANTS[isDocument ? 'document' : variant]}`

  return (
    <div className={`${proseClass} dark:prose-invert ${className}`}>
      {elements}
    </div>
  )
}