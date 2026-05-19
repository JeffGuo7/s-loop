import { useRef } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { useAppStore } from '../../stores'
import { MessageItem } from './MessageItem'
import type { TextPart } from '../../types'

interface MessageListProps {
  sessionId: string
}

export function MessageList({ sessionId }: MessageListProps) {
  const messages = useAppStore((state) => state.sessionMessages[sessionId] || [])
  const streamingMessage = useAppStore((state) => state.streamingMessage[sessionId])
  const virtuosoRef = useRef(null)

  const allMessages = [...messages]
  if (streamingMessage?.isStreaming && streamingMessage.parts.length > 0) {
    allMessages.push({
      info: {
        id: streamingMessage.messageID,
        sessionID: sessionId,
        role: 'assistant' as const,
        time: { created: Date.now() },
      },
      parts: streamingMessage.parts,
    })
  }

  if (allMessages.length === 0) {
    return null
  }

  return (
    <div className="flex-1 overflow-hidden">
      <Virtuoso
        ref={virtuosoRef}
        data={allMessages}
        followOutput="smooth"
        alignToBottom
        className="flex-1 h-full chat-scroll-area"
        itemContent={(index, message) => {
          // Find the most recent user message before this one
          let previousUserText = ''
          for (let i = index - 1; i >= 0; i--) {
            const prev = allMessages[i]
            if (prev.info.role === 'user') {
              previousUserText = prev.parts
                .filter((p): p is TextPart => p.type === 'text')
                .map((p) => p.text)
                .join('\n')
              break
            }
          }
          return (
            <div className="mx-auto max-w-[var(--chat-max-width)] px-2">
              <MessageItem
                message={message}
                previousUserText={previousUserText}
                isStreaming={
                  streamingMessage?.isStreaming &&
                  index === allMessages.length - 1 &&
                  message.info.role === 'assistant'
                }
              />
            </div>
          )
        }}
      />
    </div>
  )
}