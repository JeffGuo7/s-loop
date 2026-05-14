import { useEffect, useRef } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { useAppStore } from '../../stores'
import { MessageItem } from './MessageItem'

interface MessageListProps {
  sessionId: string
}

export function MessageList({ sessionId }: MessageListProps) {
  const messages = useAppStore((state) => state.sessionMessages[sessionId] || [])
  const streamingMessage = useAppStore((state) => state.streamingMessage[sessionId])
  const virtuosoRef = useRef(null)

  // Combine messages with streaming message
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

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (streamingMessage?.isStreaming) {
      // Virtuoso will handle this with followOutput
    }
  }, [streamingMessage])

  if (allMessages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-[var(--color-text-secondary)]">
          <p className="text-lg mb-2">Start a conversation</p>
          <p className="text-sm">Send a message to begin chatting with AI</p>
        </div>
      </div>
    )
  }

  return (
    <Virtuoso
      ref={virtuosoRef}
      data={allMessages}
      followOutput="smooth"
      alignToBottom
      className="flex-1"
      itemContent={(index, message) => (
        <MessageItem
          message={message}
          isStreaming={
            streamingMessage?.isStreaming &&
            index === allMessages.length - 1 &&
            message.info.role === 'assistant'
          }
        />
      )}
    />
  )
}