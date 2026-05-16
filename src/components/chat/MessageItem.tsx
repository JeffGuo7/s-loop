import { memo, useMemo } from 'react'
import { TextPartView, ReasoningView, ToolPartView, StepView } from './parts'
import { MessageActionBar } from './shared/MessageActionBar'
import { StreamingIndicator } from './shared/StreamingIndicator'
import { shouldUseDocumentLayout } from './shared/Markdown'
import type { KiloMessage, MessagePart, TextPart, ToolCallPart, StepPart, FilePart } from '../../types'

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
    if (lastPart?.type === 'tool' && (lastPart as ToolCallPart).state === 'running') return 'Running'
    return 'Working'
  }, [isStreaming, message.parts])

  if (isUser) {
    return (
      <div className="flex justify-end px-4 py-3 group animate-message-appear">
        <div className="max-w-[82%] sm:max-w-[78%] lg:max-w-[72%]">
          <div
            className="bg-[var(--color-surface-user-msg)] text-[var(--color-text-primary)] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words"
            style={{ borderRadius: '18px 4px 18px 18px' }}
          >
            {message.parts.map((part, idx) => (
              <MessagePartRenderer
                key={part.id || idx}
                part={part}
                isStreaming={false}
              />
            ))}
          </div>
          <MessageActionBar
            content={allText}
            timestamp={message.info.time.created}
            align="end"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start px-4 py-3 group animate-message-appear">
      <div
        className={
          isDocument
            ? 'w-full max-w-full'
            : 'max-w-[88%] sm:max-w-[80%] lg:max-w-[72%]'
        }
      >
        <div
          className="border border-[var(--color-border-assistant)]/60 bg-[var(--color-surface)] shadow-sm px-4 py-3 text-sm leading-relaxed"
          style={{ borderRadius: '20px 20px 20px 8px' }}
        >
          {message.parts.length === 0 && isStreaming && (
            <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
              <div className="w-2 h-2 bg-[var(--color-primary)] rounded-full animate-pulse-dot" />
              <span className="text-sm">Thinking...</span>
            </div>
          )}

          {message.parts.map((part, idx) => (
            <MessagePartRenderer
              key={part.id || idx}
              part={part}
              isStreaming={isStreaming && idx === message.parts.length - 1}
            />
          ))}
        </div>

        {isStreaming && streamingVerb && (
          <div className="mt-2">
            <StreamingIndicator verb={streamingVerb} />
          </div>
        )}

        {!isStreaming && (
          <MessageActionBar
            content={allText}
            timestamp={message.info.time.created}
            align="start"
          />
        )}

        {!isStreaming && message.info.cost !== undefined && (
          <div className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
            {message.info.tokens && (
              <span>{message.info.tokens.input + message.info.tokens.output} tokens</span>
            )}
            {message.info.cost > 0 && (
              <span className="ml-2">${message.info.cost.toFixed(4)}</span>
            )}
          </div>
        )}
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
      return <ToolPartView part={part as ToolCallPart} />
    case 'step-start':
    case 'step-finish':
      return <StepView part={part as StepPart} />
    case 'file':
      return (
        <div className="text-sm text-[var(--color-text-secondary)]">
          📎 {(part as FilePart).filename || 'File'}
        </div>
      )
    default:
      return null
  }
}