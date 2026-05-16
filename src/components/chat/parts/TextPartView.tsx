import { Markdown, shouldUseDocumentLayout } from '../shared/Markdown'

interface TextPartViewProps {
  text: string
  isStreaming?: boolean
}

export function TextPartView({ text, isStreaming = false }: TextPartViewProps) {
  if (!text) return null

  const isDocument = shouldUseDocumentLayout(text)

  return (
    <div className={isDocument ? '' : 'min-w-0'}>
      <Markdown variant={isDocument ? 'document' : 'default'}>
        {text}
      </Markdown>
      {isStreaming && (
        <span className="shimmer-cursor" />
      )}
    </div>
  )
}