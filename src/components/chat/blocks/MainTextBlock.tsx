import { TextPartView } from '../parts'
import type { MessagePart } from '../../../types'

interface MainTextBlockProps {
  parts: MessagePart[]
  isStreaming: boolean
  isDocument: boolean
}

export function MainTextBlock({ parts, isStreaming, isDocument }: MainTextBlockProps) {
  // Merge all text from sequential text parts
  const allText = parts.map(p => (p as any).text || '').join('\n')

  if (isDocument) {
    return (
      <div className="relative">
        <div className="transition-all duration-700 group/text-part">
          <TextPartView text={allText} isStreaming={isStreaming} />
          {isStreaming && (
            <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-[var(--color-accent)] rounded-full animate-pulse shadow-[0_0_8px_var(--color-accent)]" />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`relative px-6 py-5 rounded-[28px] rounded-tl-[4px] transition-all duration-700 group/text-part ${
      isStreaming
        ? 'bg-[var(--color-accent-subtle)]/20 border border-[var(--color-accent)]/20 shadow-[0_8px_32px_rgba(var(--color-accent-rgb),0.08)]'
        : 'bg-[var(--color-surface)]/40 backdrop-blur-xl border border-black/[0.03] dark:border-white/[0.03] shadow-sm hover:shadow-md hover:bg-[var(--color-surface)]/60'
    }`}>
      <TextPartView text={allText} isStreaming={isStreaming} />
      {isStreaming && (
        <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-[var(--color-accent)] rounded-full animate-pulse shadow-[0_0_8px_var(--color-accent)]" />
      )}
    </div>
  )
}
