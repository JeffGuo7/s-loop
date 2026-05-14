import { useMemo } from 'react'
import { marked } from 'marked'

interface MarkdownProps {
  children: string
  className?: string
}

// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true,
})

export function Markdown({ children, className = '' }: MarkdownProps) {
  const html = useMemo(() => {
    try {
      return marked.parse(children) as string
    } catch {
      return children
    }
  }, [children])

  return (
    <div
      className={`prose prose-sm max-w-none dark:prose-invert prose-pre:bg-[var(--color-surface-dim)] prose-pre:border prose-pre:border-[var(--color-border)] prose-code:text-[var(--color-primary)] ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
