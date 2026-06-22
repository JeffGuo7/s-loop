import { useEffect, useRef } from 'react'
import { getBaseUrl } from '../utils/piClient'
import { createSession, getSession, saveMessage, updateSession } from '../utils/database'
import { useAppStore } from '../stores'

type PlatformConversation = {
  id: string
  sessionId: string
  title: string
  platformId: 'telegram' | 'feishu' | 'dingtalk' | 'wechat'
  updatedAt: number
}

type PlatformSyncedMessage = {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  text: string
  createdAt: number
}

type PlatformSyncSnapshot = {
  updatedAt: number
  conversations: PlatformConversation[]
  messages: PlatformSyncedMessage[]
}

export function useTelegramChatSync() {
  const lastUpdatedAtRef = useRef(0)
  const syncingRef = useRef(false)

  useEffect(() => {
    let disposed = false

    const sync = async () => {
      if (disposed || syncingRef.current) return
      syncingRef.current = true
      try {
        const res = await fetch(`${getBaseUrl()}/platforms/chat-sync`)
        if (!res.ok) return
        const snapshot = await res.json() as PlatformSyncSnapshot
        if (!snapshot.updatedAt || snapshot.updatedAt <= lastUpdatedAtRef.current) {
          return
        }

        for (const conversation of snapshot.conversations || []) {
          const existing = await getSession(conversation.sessionId)
          const sessionModel = `platform:${conversation.platformId}`
          if (!existing) {
            await createSession(conversation.sessionId, conversation.title, sessionModel)
          } else if (existing.title !== conversation.title) {
            await updateSession(conversation.sessionId, { title: conversation.title, model: sessionModel })
          } else {
            await updateSession(conversation.sessionId, { model: sessionModel })
          }
        }

        for (const message of snapshot.messages || []) {
          await saveMessage(
            message.id,
            message.sessionId,
            message.role,
            [
              {
                id: `${message.id}-text`,
                type: 'text',
                text: message.text,
                sessionID: message.sessionId,
                messageID: message.id,
                time: { created: message.createdAt, completed: message.createdAt },
              },
            ],
            {
              id: message.id,
              sessionID: message.sessionId,
              role: message.role,
              time: { created: message.createdAt, completed: message.createdAt },
            },
          )
        }

        lastUpdatedAtRef.current = snapshot.updatedAt
        await useAppStore.getState().loadFromDb()

        const activeSessionId = useAppStore.getState().activeSessionId
        if (activeSessionId && snapshot.messages.some((message) => message.sessionId === activeSessionId)) {
          await useAppStore.getState().loadMessages(activeSessionId)
        }
      } catch {
        // Ignore sync failures while the local server is still starting.
      } finally {
        syncingRef.current = false
      }
    }

    void sync()
    const timer = window.setInterval(() => {
      void sync()
    }, 4000)

    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [])
}
