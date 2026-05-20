import { memo, useMemo } from 'react'
import { TextPartView, ReasoningView, ToolPartView, StepView } from './parts'
import { MessageActionBar } from './shared/MessageActionBar'
import { StreamingIndicator } from './shared/StreamingIndicator'
import { shouldUseDocumentLayout } from './shared/Markdown'
import { User, Cpu } from 'lucide-react'
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
      <div className="flex justify-end py-2 group animate-message-appear">
        <div className="flex flex-row-reverse gap-3 max-w-[80%] lg:max-w-[68%]">
          {/* Avatar */}
          <div className="shrink-0 mt-1">
            <div className="w-8 h-8 rounded-full bg-(--color-accent) flex items-center justify-center text-white shadow-sm">
              <User size={16} strokeWidth={2.5} />
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 min-w-0">
            <div
              className="bg-(--color-accent) text-white px-5 py-3.5 text-sm leading-relaxed whitespace-pre-wrap wrap-break-word shadow-sm rounded-[20px_6px_20px_20px]"
            >
              {message.parts.map((part, idx) => (
                <MessagePartRenderer
                  key={part.id || idx}
                  part={part}
                  isStreaming={false}
                />
              ))}
            </div>
            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
              <MessageActionBar
                content={allText}
                timestamp={message.info.time.created}
                align="end"
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start py-3 group animate-message-appear">
      <div
        className={`flex gap-4 ${
          isDocument
            ? 'w-full max-w-full'
            : 'max-w-[94%] lg:max-w-[86%]'
        }`}
      >
        {/* Avatar */}
        <div className="shrink-0 mt-1">
          <div className="w-8 h-8 rounded-full bg-(--color-surface) border border-(--color-border) flex items-center justify-center text-(--color-accent) shadow-sm">
            <Cpu size={18} strokeWidth={2.5} />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="bg-(--color-surface) border border-(--color-border) shadow-sm px-5 py-4 rounded-[6px_20px_20px_20px]">
          <div className="space-y-3">
            {message.parts.length === 0 && isStreaming && (
              <div className="flex items-center gap-3 py-2">
                <div className="flex gap-1.5">
                  <div className="w-1.5 h-1.5 bg-(--color-accent) rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-1.5 h-1.5 bg-(--color-accent) rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-1.5 h-1.5 bg-(--color-accent) rounded-full animate-bounce" />
                </div>
              </div>
            )}

            <div className="space-y-3">
              {message.parts.map((part, idx) => (
                <MessagePartRenderer
                  key={part.id || idx}
                  part={part}
                  isStreaming={isStreaming}
                />
              ))}
            </div>
          </div>
          </div>

          <div className="mt-2 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="flex items-center gap-4">
              <MessageActionBar
                content={allText}
                timestamp={message.info.time.created}
                align="start"
              />
              {!isStreaming && message.info.cost !== undefined && (
                <div className="text-[10px] font-bold text-(--color-text-tertiary) tracking-widest uppercase bg-(--color-surface-secondary) px-2.5 py-1 rounded-full border border-(--color-border)">
                  {message.info.tokens && (
                    <span>{(message.info.tokens.input ?? 0) + (message.info.tokens.output ?? 0)} tokens</span>
                  )}
                  {message.info.cost > 0 && (
                    <span className="ml-3 opacity-60 border-l border-(--color-border) pl-3">${message.info.cost.toFixed(5)}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {isStreaming && streamingVerb && (
            <div className="mt-4">
              <StreamingIndicator verb={streamingVerb} />
            </div>
          )}
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
        <div className="text-sm text-(--color-text-secondary)">
          {(part as FilePart).filename || 'File'}
        </div>
      )
    default:
      return null
  }
}
