import { useRef, useMemo } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { useAppStore } from '../../stores'
import { MessageItem } from './MessageItem'
import type { KiloMessage } from '../../types'

const EMPTY_MESSAGES: never[] = []

interface MessageListProps {
  sessionId: string
}

export function MessageList({ sessionId }: MessageListProps) {
  const messages = useAppStore((state) => state.sessionMessages[sessionId]) ?? EMPTY_MESSAGES
  const streamingMessage = useAppStore((state) => state.streamingMessage[sessionId])
  const virtuosoRef = useRef(null)

  const groupedMessages = useMemo(() => {
    const rawMessages = [...messages]
    if (streamingMessage?.isStreaming && streamingMessage.parts.length > 0) {
      rawMessages.push({
        info: {
          id: streamingMessage.messageID,
          sessionID: sessionId,
          role: 'assistant' as const,
          time: { created: Date.now() },
        },
        parts: streamingMessage.parts,
      })
    }

    if (rawMessages.length === 0) return []

    // Merge consecutive assistant messages into one visual bubble
    const result: KiloMessage[] = []
    for (const msg of rawMessages) {
      const last = result[result.length - 1]
      if (last && last.info.role === 'assistant' && msg.info.role === 'assistant') {
        // Create a new object to avoid mutating store data
        result[result.length - 1] = {
          ...last,
          parts: [...last.parts, ...msg.parts],
          // Keep the latest info/stats
          info: {
            ...msg.info,
            time: last.info.time, // Keep original start time
          }
        }
      } else {
        result.push({ ...msg })
      }
    }
    return result
  }, [messages, streamingMessage, sessionId])

  if (groupedMessages.length === 0) {
    return null
  }

  return (
    <div className="flex-1 overflow-hidden pt-4">
      <Virtuoso
        ref={virtuosoRef}
        data={groupedMessages}
        followOutput="smooth"
        alignToBottom
        className="flex-1 h-full chat-scroll-area"
        components={{
          Footer: () => <div className="h-48" />
        }}
        itemContent={(index, message) => {
          const isStreaming = 
            streamingMessage?.isStreaming && 
            index === groupedMessages.length - 1 && 
            message.info.role === 'assistant'

          return (
            <div className="px-8">
              <MessageItem
                message={message}
                isStreaming={isStreaming}
              />
            </div>
          )
        }}
      />
    </div>
  )
}
