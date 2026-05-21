import { memo, useMemo } from 'react'
import { TextPartView, ReasoningView, ToolPartView, ThoughtStackView } from './parts'
import { MessageActionBar } from './shared/MessageActionBar'
import { StreamingIndicator } from './shared/StreamingIndicator'
import { shouldUseDocumentLayout } from './shared/Markdown'
import { User, Cpu } from 'lucide-react'

import type { KiloMessage, MessagePart, TextPart, ToolPart, FilePart } from '../../types'

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
      <div className="flex justify-end py-4 group animate-message-appear">
        <div className="flex flex-row-reverse gap-4 max-w-[85%] lg:max-w-[70%]">
          {/* Avatar */}
          <div className="shrink-0 mt-1">
            <div className="w-10 h-10 rounded-[14px] bg-accent flex items-center justify-center text-white shadow-lg transition-transform duration-500">
              <User size={20} strokeWidth={3} />
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 min-w-0">
            <div
              className="bg-accent text-accent-foreground px-6 py-5 text-[15px] leading-relaxed wrap-break-word shadow-xl shadow-accent/10 rounded-[28px] rounded-tr-[4px] group-hover:shadow-accent/20 transition-all duration-500 font-medium"
            >
              {message.parts.map((part, idx) => (
                <div key={part.id || idx} className="text-accent-foreground">
                  {part.type === 'text' ? part.text.trim() : null}
                </div>
              ))}
            </div>
            <div className="opacity-0 group-hover:opacity-100 transition-all duration-700">
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
    <div className="flex justify-start py-6 group animate-message-appear">
      <div
        className={`flex gap-4 ${
          isDocument
            ? 'w-full max-w-full'
            : 'max-w-[96%] lg:max-w-[85%]'
        }`}
      >
        {/* Avatar */}
        <div className="shrink-0 mt-1">
          <div className="relative group/bot">
            <div className="relative w-10 h-10 rounded-[14px] bg-surface border border-border flex items-center justify-center text-accent shadow-sm group-hover:scale-105 transition-transform duration-500">
              <Cpu size={20} strokeWidth={3} className="drop-shadow-[0_0_8px_rgba(var(--color-accent-rgb),0.3)]" />
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="space-y-4">
            {message.parts.length === 0 && isStreaming && (
              <div className="flex items-center gap-3 py-2">
                <div className="w-2 h-2 bg-accent/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="w-2 h-2 bg-accent/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="w-2 h-2 bg-accent/40 rounded-full animate-bounce" />
              </div>
            )}

            <div className="relative">
              <div className="space-y-4">
                {renderGroupedParts(message.parts, isStreaming)}
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-all duration-700 px-1">
            <div className="flex items-center gap-6">
              <MessageActionBar
                content={allText}
                timestamp={message.info.time.created}
                align="start"
              />
              {!isStreaming && message.info.cost !== undefined && (
                <div className="text-[10px] font-bold text-text-tertiary tracking-[0.1em] uppercase flex items-center gap-3 opacity-50">
                  {message.info.tokens && (
                    <span>{(message.info.tokens.input ?? 0) + (message.info.tokens.output ?? 0)} tokens</span>
                  )}
                  {message.info.cost > 0 && (
                    <span className="text-accent/90">${message.info.cost.toFixed(5)}</span>
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

function renderGroupedParts(parts: MessagePart[], isStreaming: boolean) {
  const renderedParts: React.ReactNode[] = []
  let currentStack: MessagePart[] = []

  const flushStack = (idx: number) => {
    if (currentStack.length > 0) {
      renderedParts.push(
        <ThoughtStackView 
          key={`stack-${idx}`} 
          parts={[...currentStack]} 
          isStreaming={isStreaming} 
        />
      )
      currentStack = []
    }
  }

  parts.forEach((part, idx) => {
    // Skip decluttering parts entirely so they don't break the stack
    if (part.type === 'step-start' || part.type === 'step-finish') {
      return
    }

    if (part.type === 'reasoning' || part.type === 'tool') {
      currentStack.push(part)
    } else {
      flushStack(idx)
      renderedParts.push(
        <MessagePartRenderer 
          key={part.id || idx} 
          part={part} 
          isStreaming={isStreaming} 
        />
      )
    }
  })

  flushStack(parts.length)
  return renderedParts
}

interface MessagePartRendererProps {
  part: MessagePart
  isStreaming?: boolean
}

function MessagePartRenderer({ part, isStreaming }: MessagePartRendererProps) {
  switch (part.type) {
    case 'text':
      return (
        <div className={`
          relative px-6 py-5 rounded-[28px] rounded-tl-[4px] transition-all duration-700 group/text-part
          ${isStreaming 
            ? 'bg-accent-subtle/20 border-accent/20 shadow-[0_8px_32px_rgba(var(--color-accent-rgb),0.08)]' 
            : 'bg-surface/40 backdrop-blur-xl border border-black/[0.03] dark:border-white/[0.03] shadow-sm hover:shadow-md hover:bg-surface/60'
          }
        `}>
          <TextPartView text={part.text} isStreaming={isStreaming} />
          {isStreaming && (
            <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-accent rounded-full animate-pulse shadow-[0_0_8px_var(--color-accent)]" />
          )}
        </div>
      )
    case 'reasoning':
      return <ReasoningView text={part.text} isActive={isStreaming} />
    case 'tool':
      return <ToolPartView part={part as ToolPart} />
    case 'step-start':
    case 'step-finish':
      // Hide step-start and step-finish to declutter the UI, as tool/reasoning cards already show status
      return null
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
