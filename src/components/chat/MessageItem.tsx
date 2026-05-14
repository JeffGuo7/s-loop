import { memo } from 'react'
import { User, Bot } from 'lucide-react'
import { TextPartView, ReasoningView, ToolPartView, StepView } from './parts'
import type { KiloMessage, MessagePart } from '../../types'

interface MessageItemProps {
  message: KiloMessage
  isStreaming?: boolean
  verbose?: boolean
}

export const MessageItem = memo(function MessageItem({ message, isStreaming, verbose = false }: MessageItemProps) {
  const isUser = message.info.role === 'user'

  return (
    <div className={`flex gap-3 py-4 px-4 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser
            ? 'bg-[var(--color-primary)]'
            : 'bg-[var(--color-surface-dim)] border border-[var(--color-border)]'
        }`}
      >
        {isUser ? (
          <User size={16} className="text-white" />
        ) : (
          <Bot size={16} className="text-[var(--color-text-secondary)]" />
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 ${isUser ? 'text-right' : ''}`}>
        <div
          className={`inline-block max-w-[85%] text-left ${
            isUser
              ? 'bg-[var(--color-primary)] text-white rounded-2xl rounded-tr-sm px-4 py-2'
              : ''
          }`}
        >
          {message.parts.length === 0 && isStreaming && (
            <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
              <div className="w-2 h-2 bg-[var(--color-primary)] rounded-full animate-pulse" />
              <span className="text-sm">Thinking...</span>
            </div>
          )}

          {message.parts.map((part, idx) => (
            <MessagePartRenderer
              key={part.id || idx}
              part={part}
              isStreaming={isStreaming && idx === message.parts.length - 1}
              verbose={verbose}
            />
          ))}
        </div>

        {/* Metadata for assistant messages */}
        {!isUser && message.info.cost !== undefined && (
          <div className="mt-1 text-xs text-[var(--color-text-secondary)]">
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
  verbose?: boolean
}

function MessagePartRenderer({ part, isStreaming, verbose }: MessagePartRendererProps) {
  switch (part.type) {
    case 'text':
      return <TextPartView part={part} isStreaming={isStreaming} />
    case 'reasoning':
      return <ReasoningView part={part} defaultExpanded={verbose} />
    case 'tool':
      return <ToolPartView part={part} verbose={verbose} />
    case 'step-start':
    case 'step-finish':
      return <StepView part={part} />
    case 'file':
      return (
        <div className="text-sm text-[var(--color-text-secondary)]">
          📎 {part.filename || 'File'}
        </div>
      )
    default:
      return null
  }
}