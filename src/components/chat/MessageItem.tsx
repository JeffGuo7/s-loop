import { memo, useMemo } from 'react'
import { TextPartView, ReasoningView, ToolPartView, StepView } from './parts'
import { MessageActionBar } from './shared/MessageActionBar'
import { StreamingIndicator } from './shared/StreamingIndicator'
import { shouldUseDocumentLayout } from './shared/Markdown'
import { User, Cpu, Sparkles } from 'lucide-react'
import { Card } from '../ui'
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
      <div className="flex justify-end py-3 group animate-message-appear">
        <div className="flex flex-row-reverse gap-4 max-w-[85%] lg:max-w-[75%]">
          {/* Avatar */}
          <div className="shrink-0 mt-1">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-(--color-accent) to-(--color-accent-light) flex items-center justify-center text-white shadow-lg shadow-accent/20 ring-2 ring-white/10">
              <User size={18} strokeWidth={2.5} />
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 min-w-0">
            <div
              className="bg-(--color-accent) text-(--color-accent-foreground) px-5 py-4 text-[15px] leading-relaxed whitespace-pre-wrap wrap-break-word shadow-md rounded-(--radius-user-msg) ring-1 ring-white/10"
            >
              {message.parts.map((part, idx) => (
                <MessagePartRenderer
                  key={part.id || idx}
                  part={part}
                  isStreaming={false}
                />
              ))}
            </div>
            <div className="opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-1 group-hover:translate-y-0">
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
    <div className="flex justify-start py-4 group animate-message-appear">
      <div
        className={`flex gap-4 ${
          isDocument
            ? 'w-full max-w-full'
            : 'max-w-[96%] lg:max-w-[90%]'
        }`}
      >
        {/* Avatar */}
        <div className="shrink-0 mt-1">
          <div className="w-9 h-9 rounded-xl bg-(--color-surface) border border-(--color-border) flex items-center justify-center text-(--color-accent) shadow-sm ring-2 ring-black/[0.02]">
            <Sparkles size={18} strokeWidth={2.5} className="animate-spin-slow" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <Card
            variant="default"
            className="px-6 py-5 rounded-(--radius-assistant-msg) border-(--color-border)/60 shadow-sm bg-gradient-to-b from-white to-(--color-surface-secondary)/20 dark:from-(--color-surface) dark:to-(--color-surface-secondary)/10"
          >
            <div className="space-y-4">
              {message.parts.length === 0 && isStreaming && (
                <div className="flex items-center gap-3 py-2">
                  <div className="flex gap-2">
                    <div className="w-2 h-2 bg-(--color-accent)/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-2 h-2 bg-(--color-accent)/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-2 h-2 bg-(--color-accent)/40 rounded-full animate-bounce" />
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {message.parts.map((part, idx) => (
                  <MessagePartRenderer
                    key={part.id || idx}
                    part={part}
                    isStreaming={isStreaming}
                  />
                ))}
              </div>
            </div>
          </Card>

          <div className="mt-3 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-1 group-hover:translate-y-0 px-2">
            <div className="flex items-center gap-4">
              <MessageActionBar
                content={allText}
                timestamp={message.info.time.created}
                align="start"
              />
              {!isStreaming && message.info.cost !== undefined && (
                <div className="text-[10px] font-bold text-(--color-text-tertiary) tracking-widest uppercase bg-(--color-surface-secondary) px-3 py-1.5 rounded-full border border-(--color-border-light) shadow-xs flex items-center gap-2">
                  {message.info.tokens && (
                    <span className="flex items-center gap-1">
                      <Cpu size={10} />
                      {(message.info.tokens.input ?? 0) + (message.info.tokens.output ?? 0)}
                    </span>
                  )}
                  {message.info.cost > 0 && (
                    <span className="opacity-40 font-normal">/</span>
                  )}
                  {message.info.cost > 0 && (
                    <span className="text-(--color-accent)/80">${message.info.cost.toFixed(5)}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {isStreaming && streamingVerb && (
            <div className="mt-5 px-1">
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
