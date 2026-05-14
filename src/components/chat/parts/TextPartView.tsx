import { Markdown, StatusIndicator } from '../shared'
import type { TextPart } from '../../../types'

interface TextPartViewProps {
  part: TextPart
  isStreaming?: boolean
}

export function TextPartView({ part, isStreaming }: TextPartViewProps) {
  if (!part.text) return null

  return (
    <div className="relative">
      <Markdown>{part.text}</Markdown>
      {isStreaming && <StatusIndicator state="streaming" />}
    </div>
  )
}