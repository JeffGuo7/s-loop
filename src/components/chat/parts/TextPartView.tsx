import { shouldUseDocumentLayout } from '../shared/Markdown'
import { SmoothStream } from '../shared/SmoothStream'

interface TextPartViewProps {
  text: string
  isStreaming?: boolean
}

export function TextPartView({ text, isStreaming = false }: TextPartViewProps) {
  if (!text) return null

  const isDocument = shouldUseDocumentLayout(text)

  return (
    <div className={isDocument ? '' : 'min-w-0'}>
      <SmoothStream text={text} isStreaming={isStreaming} />
      {isStreaming && (
        <span className="shimmer-cursor" />
      )}
    </div>
  )
}
