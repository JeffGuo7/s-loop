import { memo, useMemo } from 'react'
import { TextPartView, ReasoningView, ToolPartView, StepView } from './parts'
import { MessageActionBar } from './shared/MessageActionBar'
import { StreamingIndicator } from './shared/StreamingIndicator'
import { shouldUseDocumentLayout } from './shared/Markdown'
import { User, Cpu } from 'lucide-react'
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
      <div className="flex justify-end py-8 group animate-message-appear">
        <div className="flex flex-row-reverse gap-8 max-w-[85%] lg:max-w-[70%]">
          {/* Avatar */}
          <div className="shrink-0 mt-2">
            <div className="w-12 h-12 rounded-[18px] bg-gradient-to-br from-accent to-accent-light flex items-center justify-center text-white shadow-2xl shadow-accent/25 ring-4 ring-white/10 group-hover:scale-110 transition-transform duration-500">
              <User size={24} strokeWidth={3} />
            </div>
          </div>

          <div className="flex flex-col items-end gap-4 min-w-0">
            <div
              className="bg-accent text-accent-foreground px-8 py-5 text-[18px] leading-relaxed wrap-break-word shadow-2xl shadow-accent/15 rounded-[32px] rounded-tr-[10px] ring-1 ring-white/10 group-hover:shadow-accent/25 transition-all duration-500"
            >
              {message.parts.map((part, idx) => (
                <MessagePartRenderer
                  key={part.id || idx}
                  part={part.type === 'text' ? { ...part, text: part.text.trim() } : part}
                  isStreaming={false}
                />
              ))}
            </div>
            <div className="opacity-0 group-hover:opacity-100 transition-all duration-700 translate-y-2 group-hover:translate-y-0">
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
    <div className="flex justify-start py-10 group animate-message-appear">
      <div
        className={`flex gap-8 ${
          isDocument
            ? 'w-full max-w-full'
            : 'max-w-[96%] lg:max-w-[85%]'
        }`}
      >
        {/* Avatar - Robot Head style */}
        <div className="shrink-0 mt-2">
          <div className="relative group/bot">
            <div className="absolute inset-0 bg-accent/20 blur-[20px] rounded-full scale-150 opacity-0 group-hover/bot:opacity-100 transition-opacity duration-700" />
            <div className="relative w-12 h-12 rounded-[18px] bg-surface border border-border flex items-center justify-center text-accent shadow-lg ring-4 ring-black/[0.03] group-hover:scale-110 transition-transform duration-500">
              <Cpu size={24} strokeWidth={3} className="drop-shadow-[0_0_8px_rgba(var(--color-accent-rgb),0.3)]" />
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <Card
            variant="default"
            className="px-10 py-8 rounded-[40px] rounded-tl-[12px] border-border/60 shadow-md bg-linear-to-b from-white to-surface-secondary/30 dark:from-surface dark:to-surface-secondary/20 hover:shadow-xl transition-all duration-700"
          >
            <div className="space-y-8">
              {message.parts.length === 0 && isStreaming && (
                <div className="flex items-center gap-5 py-4">
                  <div className="flex gap-3">
                    <div className="w-3 h-3 bg-accent/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-3 h-3 bg-accent/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-3 h-3 bg-accent/40 rounded-full animate-bounce" />
                  </div>
                </div>
              )}

              <div className="space-y-8">
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

          <div className="mt-6 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-all duration-700 translate-y-2 group-hover:translate-y-0 px-4">
            <div className="flex items-center gap-8">
              <MessageActionBar
                content={allText}
                timestamp={message.info.time.created}
                align="start"
              />
              {!isStreaming && message.info.cost !== undefined && (
                <div className="text-[12px] font-bold text-text-tertiary tracking-[0.2em] uppercase bg-surface-secondary/90 px-5 py-2.5 rounded-full border border-border-light shadow-sm flex items-center gap-4">
                  {message.info.tokens && (
                    <span className="flex items-center gap-2.5">
                      <Cpu size={14} className="opacity-50" />
                      <span className="opacity-80">{(message.info.tokens.input ?? 0) + (message.info.tokens.output ?? 0)} tokens</span>
                    </span>
                  )}
                  {message.info.cost > 0 && (
                    <span className="opacity-20 font-normal">|</span>
                  )}
                  {message.info.cost > 0 && (
                    <span className="text-accent/90 font-extrabold">${message.info.cost.toFixed(5)}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {isStreaming && streamingVerb && (
            <div className="mt-8 px-4">
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
        <div className="text-[15px] text-text-secondary font-medium">
          {(part as FilePart).filename || 'File'}
        </div>
      )
    default:
      return null
  }
}
