import { memo, useMemo } from 'react'
import { TextPartView, ReasoningView, ToolPartView, StepView } from './parts'
import { MessageActionBar } from './shared/MessageActionBar'
import { StreamingIndicator } from './shared/StreamingIndicator'
import { shouldUseDocumentLayout } from './shared/Markdown'
import type { KiloMessage, MessagePart, TextPart, ToolPart, StepStartPart, StepFinishPart, FilePart } from '../../types'

interface MessageItemProps {
  message: KiloMessage
  isStreaming?: boolean
}

export const MessageItem = memo(function MessageItem({ message, isStreaming = false }: MessageItemProps) {
  const isUser = message.info.role === 'user'

  const allText = useMemo(
    () => message.parts.filter((p): p is TextPart => p.type === 'text').map((p) => p.text).join('\n'),
    [message.parts],
  )

  const isDocument = !isUser && shouldUseDocumentLayout(allText)

  const streamingVerb = useMemo(() => {
    if (!isStreaming) return undefined
    const lastPart = message.parts[message.parts.length - 1]
    if (lastPart?.type === 'reasoning') return 'Thinking'
    if (lastPart?.type === 'tool') return 'Running'
    return 'Working'
  }, [isStreaming, message.parts])

  if (isUser) {
    return (
      <div className="flex justify-end px-6 py-4 group animate-message-appear">
        <div className="max-w-[85%] sm:max-w-[75%] lg:max-w-[65%]">
          <div
            className="bg-[var(--color-primary)] text-white px-5 py-3.5 text-sm leading-relaxed whitespace-pre-wrap break-words shadow-md shadow-[var(--color-primary)]/10"
            style={{ borderRadius: '24px 24px 4px 24px' }}
          >
            {message.parts.map((part, idx) => (
              <MessagePartRenderer
                key={part.id || idx}
                part={part}
                isStreaming={false}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
            <MessageActionBar
              content={allText}
              timestamp={message.info.time.created}
              align="end"
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start px-6 py-4 group animate-message-appear">
      <div
        className={
          isDocument
            ? 'w-full max-w-full'
            : 'max-w-[92%] sm:max-w-[85%] lg:max-w-[75%]'
        }
      >
        <div
          className="bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm px-6 py-4 text-sm leading-relaxed relative"
          style={{ borderRadius: '24px 24px 24px 4px' }}
        >
          {message.parts.length === 0 && isStreaming && (
            <div className="flex items-center gap-3 py-2 text-[var(--color-text-secondary)]">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-[var(--color-primary)] rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="w-1.5 h-1.5 bg-[var(--color-primary)] rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="w-1.5 h-1.5 bg-[var(--color-primary)] rounded-full animate-bounce" />
              </div>
              <span className="text-xs font-bold uppercase tracking-widest opacity-60">Thinking</span>
            </div>
          )}

          <div className="space-y-4">
            {message.parts.map((part, idx) => (
              <MessagePartRenderer
                key={part.id || idx}
                part={part}
                isStreaming={isStreaming && idx === message.parts.length - 1}
              />
            ))}
          </div>

          {isStreaming && streamingVerb && (
            <div className="absolute -bottom-6 left-2">
              <StreamingIndicator verb={streamingVerb} />
            </div>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <MessageActionBar
              content={allText}
              timestamp={message.info.time.created}
              align="start"
            />
            {!isStreaming && message.info.cost !== undefined && (
              <div className="text-[10px] font-bold text-[var(--color-text-tertiary)] bg-[var(--color-surface-dim)] px-2 py-0.5 rounded-full border border-[var(--color-border)]">
                {message.info.tokens && (
                  <span>{(message.info.tokens.input ?? 0) + (message.info.tokens.output ?? 0)} tokens</span>
                )}
                {message.info.cost > 0 && (
                  <span className="ml-2 opacity-60">${message.info.cost.toFixed(5)}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})

interface MessagePartRendererProps {
  part: MessagePart
  isStreaming?: boolean
}

function MessagePartRenderer({ part, isStreaming }: MessagePartRendererProps) {
  switch (part.type) {
    case 'text':
      return <TextPartView text={part.text} isStreaming={isStreaming} />
    case 'reasoning':
      return <ReasoningView text={part.text} isActive={isStreaming} />
    case 'tool':
      return <ToolPartView part={part as ToolPart} />
    case 'step-start':
    case 'step-finish':
      return <StepView part={part as StepStartPart | StepFinishPart} />
    case 'file':
      return (
        <div className="text-sm text-[var(--color-text-secondary)]">
          {(part as FilePart).filename || 'File'}
        </div>
      )
    default:
      return null
  }
}