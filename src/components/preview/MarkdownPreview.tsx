import { useEffect, useState } from 'react'
import { getErrorMessage } from '../../utils/errors'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeRaw from 'rehype-raw'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

interface MarkdownPreviewProps {
  filePath: string
  onLoaded: () => void
  onError: (msg: string) => void
}

export function MarkdownPreview({ filePath, onLoaded, onError }: MarkdownPreviewProps) {
  const [content, setContent] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const text = await invoke<string>('read_text_file', { path: filePath })
        if (!cancelled) {
          setContent(text)
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

  if (content === null) return null

  return (
    <div className="h-full overflow-auto px-6 py-5 prose prose-sm dark:prose-invert max-w-none prose-pre:bg-surface-secondary prose-pre:rounded-xl prose-code:text-accent">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeKatex]}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
