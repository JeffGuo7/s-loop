import { memo, useMemo } from 'react'
import { User, Bot } from 'lucide-react'
import { TextPartView, ReasoningView, ToolPartView, StepView } from './parts'
import { MessageActionBar } from './shared/MessageActionBar'
import { StreamingIndicator } from './shared/StreamingIndicator'
import { shouldUseDocumentLayout } from './shared/Markdown'
import type { KiloMessage, MessagePart, TextPart, ToolPart, StepStartPart, StepFinishPart, FilePart } from '../../types'

interface MessageItemProps {
  message: KiloMessage
  isStreaming?: boolean
  previousUserText?: string
}

export const MessageItem = memo(function MessageItem({ message, isStreaming = false, previousUserText }: MessageItemProps) {
  const isUser = message.info.role === 'user'

  const allText = useMemo(
    () => message.parts.filter((p): p is TextPart => p.type === 'text').map((p) => p.text).join('\n'),
    [message.parts],
  )

  const displayParts = useMemo(() => {
    if (isUser || !previousUserText || message.parts.length === 0) return message.parts
    const first = message.parts[0]
    if (first.type === 'text' && first.text.trim() === previousUserText.trim()) {
      return message.parts.slice(1)
    }
    return message.parts
  }, [message.parts, isUser, previousUserText])

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
      <div className="flex justify-end px-6 py-3 group animate-message-appear">
        <div className="flex items-end gap-3 max-w-full sm:max-w-[85%] lg:max-w-[75%]">
          <div className="min-w-0 flex-1 flex flex-col items-end">
            <div
              className="bg-[var(--color-user-msg)] text-[var(--color-text)] px-5 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words inline-block w-fit"
              style={{ borderRadius: 'var(--radius-user-msg)' }}
            >
              {message.parts.map((part, idx) => (
                <MessagePartRenderer
                  key={part.id || idx}
                  part={part}
                  isStreaming={false}
                />
              ))}
            </div>
            <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <MessageActionBar
                content={allText}
                timestamp={message.info.time.created}
                align="end"
              />
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-white shrink-0 shadow-sm">
            <User size={16} strokeWidth={2.5} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start px-6 py-3 group animate-message-appear">
      <div className="flex items-end gap-3 min-w-0">
        <div className="w-8 h-8 rounded-full bg-[var(--color-surface-secondary)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-accent)] shrink-0 shadow-sm">
          <Bot size={16} strokeWidth={2.5} />
        </div>
        <div className="min-w-0">
          <div
            className={
              isDocument
                ? 'w-full max-w-full'
                : 'max-w-[var(--chat-max-content)]'
            }
          >
            <div
              className="bg-[var(--color-assistant-msg)] border border-[var(--color-assistant-msg-border)] px-6 py-4 text-sm leading-relaxed relative"
              style={{ borderRadius: 'var(--radius-assistant-msg)' }}
            >
          {message.parts.length === 0 && isStreaming && (
            <div className="flex items-center gap-3 py-2 text-[var(--color-text-tertiary)]">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-[var(--color-accent)] rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="w-1.5 h-1.5 bg-[var(--color-accent)] rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="w-1.5 h-1.5 bg-[var(--color-accent)] rounded-full animate-bounce" />
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-tertiary)]">Thinking</span>
            </div>
          )}

          <div className="space-y-4">
            {displayParts.map((part, idx) => (
              <MessagePartRenderer
                key={part.id || idx}
                part={part}
                isStreaming={isStreaming && idx === displayParts.length - 1}
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
              <div className="text-[10px] text-[var(--color-text-tertiary)] bg-[var(--color-surface-secondary)] px-2 py-0.5 rounded-md border border-[var(--color-border-light)]">
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
      return <StepView part={part as StepStartPart | StepFinishPart} isActive={isStreaming} />
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