import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../../stores'
import { Cpu, Wifi, WifiOff } from 'lucide-react'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import * as Kilo from '../../utils/kiloClient'

const EMPTY_MESSAGES: never[] = []
const EMPTY_STREAMING = null

export function ChatView() {
  const {
    activeSessionId,
    sessions,
    providerConfigs,
    activeProvider,
    providerList,
    startStreaming,
    updateStreamingMessageID,
    updateStreamingPart,
    appendStreamingDelta,
    finishStreaming,
    addMessage,
    updateSessionTitle,
  } = useAppStore()

  const [error, setError] = useState<string | null>(null)
  const [serverOnline, setServerOnline] = useState(false)

  // Subscribe to SSE events on mount
  useEffect(() => {
    const unsubscribe = Kilo.subscribeToEvents({
      onPartUpdated: (part) => {
        const kiloSessionId = part.sessionID
        if (!kiloSessionId) return

        const localId = useAppStore.getState().sessions.find(s => s.kiloId === kiloSessionId)?.id
        if (!localId) return

        const streaming = useAppStore.getState().streamingMessage[localId]
        if (streaming) {
          // Update messageID from real Kilo ID if still placeholder
          if (streaming.messageID.startsWith('pending-') && part.messageID) {
            updateStreamingMessageID(localId, part.messageID)
          }
          updateStreamingPart(localId, part.id, part)
        }
      },
      onPartDelta: (kiloSessionId, _messageID, partID, delta) => {
        // Map Kilo session ID to local session ID
        const localId = useAppStore.getState().sessions.find(s => s.kiloId === kiloSessionId)?.id
        if (!localId) return

        const streaming = useAppStore.getState().streamingMessage[localId]
        if (streaming) {
          appendStreamingDelta(localId, partID, delta)
        }
      },
      onMessageUpdated: (info) => {
        const kiloSessionId = info.sessionID
        if (!kiloSessionId) return

        const localId = useAppStore.getState().sessions.find(s => s.kiloId === kiloSessionId)?.id
        if (!localId) return

        const streaming = useAppStore.getState().streamingMessage[localId]
        if (streaming) {
          useAppStore.setState((state) => ({
            streamingMessage: {
              ...state.streamingMessage,
              [localId]: { ...streaming, info },
            },
          }))
        }
      },
      onSessionIdle: (kiloSessionId) => {
        const localId = useAppStore.getState().sessions.find(s => s.kiloId === kiloSessionId)?.id
        if (localId) {
          finishStreaming(localId)
        }
      },
      onError: (err) => {
        setError(err.message)
      },
      onConnected: () => {
        setServerOnline(true)
      },
    })

    return () => {
      unsubscribe()
    }
  }, [updateStreamingMessageID, updateStreamingPart, appendStreamingDelta, finishStreaming])

  // Health check as fallback
  useEffect(() => {
    const check = async () => {
      const ok = await Kilo.health()
      setServerOnline(ok)
    }
    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [])

  const session = sessions.find((s) => s.id === activeSessionId)
  const sessionMessages = useAppStore((state) => state.sessionMessages)
  const messages = activeSessionId ? sessionMessages[activeSessionId] || EMPTY_MESSAGES : EMPTY_MESSAGES
  const isEmpty = messages.length === 0

  const handleSubmit = useCallback(
    async (content: string) => {
      if (!content || !activeSessionId) return

      setError(null)

      const providerConfig = activeProvider ? providerConfigs[activeProvider] : null
      const model = providerConfig?.model
        ? { providerID: activeProvider!, modelID: providerConfig.model }
        : undefined

      if (!model) {
        setError('No model selected. Please configure a provider in Settings.')
        return
      }

      const userMessageID = Math.random().toString(36).substring(2, 15)
      addMessage(activeSessionId, {
        info: {
          id: userMessageID,
          sessionID: activeSessionId,
          role: 'user',
          time: { created: Date.now() },
        },
        parts: [{ id: `${userMessageID}-0`, type: 'text' as const, text: content, sessionID: activeSessionId, messageID: userMessageID }],
      })

      if (session && session.title === 'New Chat') {
        updateSessionTitle(
          activeSessionId,
          content.slice(0, 40) + (content.length > 40 ? '...' : ''),
        )
      }

      let kiloId = session?.kiloId
      if (!kiloId) {
        try {
          const ks = await Kilo.createSession(session?.title)
          kiloId = ks.id
          useAppStore.setState((state) => ({
            sessions: state.sessions.map((s) =>
              s.id === activeSessionId ? { ...s, kiloId } : s,
            ),
          }))
        } catch {
          setError('Failed to create Kilo session')
          return
        }
      }

      // Start streaming — messageID will be updated from SSE events
      const assistantMessageID = `pending-${Date.now()}`
      startStreaming(activeSessionId, assistantMessageID)

      // Send prompt async — all updates come through SSE
      try {
        await Kilo.promptAsync(kiloId!, content, model)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
          setServerOnline(false)
          setError('Kilo server not reachable')
        } else {
          setError(msg)
        }
        finishStreaming(activeSessionId)
      }
    },
    [
      activeSessionId,
      activeProvider,
      providerConfigs,
      session,
      startStreaming,
      finishStreaming,
      addMessage,
      updateSessionTitle,
    ],
  )

  const abort = useCallback(() => {
    if (activeSessionId) {
      const s = sessions.find((s) => s.id === activeSessionId)
      if (s?.kiloId) {
        Kilo.abortSession(s.kiloId).catch(() => {})
      }
      finishStreaming(activeSessionId)
    }
  }, [activeSessionId, sessions, finishStreaming])

  const streamingMessages = useAppStore((state) => state.streamingMessage)
  const streamingMessage = activeSessionId ? streamingMessages[activeSessionId] : EMPTY_STREAMING
  const isStreaming = streamingMessage?.isStreaming ?? false

  if (!activeSessionId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--color-bg)]">
        <div className="text-center max-w-md space-y-5">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[var(--color-surface-secondary)] flex items-center justify-center">
            <Cpu size={28} className="text-[var(--color-text-tertiary)]" />
          </div>
          <h2 className="text-xl font-semibold">Welcome to Snotra</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Start a new conversation to begin chatting with AI
          </p>
          <ServerStatus online={serverOnline} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-[var(--color-bg)] h-full">
      {/* Offline status bar */}
      {!serverOnline && (
        <div className="px-4 py-1.5 text-xs flex items-center gap-2 border-b bg-[var(--color-error)]/10 text-[var(--color-error)] border-[var(--color-error)]/20">
          <WifiOff size={12} />
          Kilo offline
        </div>
      )}

      {/* Messages or hero empty state */}
      {isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="text-center space-y-4 mb-8">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[var(--color-surface-secondary)] flex items-center justify-center">
              <Cpu size={24} className="text-[var(--color-text-tertiary)]" />
            </div>
            <h2 className="text-xl font-semibold">How can I help?</h2>
          </div>
          <div className="w-full max-w-3xl">
            <ChatInput
              onSubmit={handleSubmit}
              onAbort={abort}
              isStreaming={isStreaming}
              placeholder="Ask anything..."
              variant="hero"
            />
          </div>
        </div>
      ) : (
        <>
          <MessageList sessionId={activeSessionId} />

          {/* Error Display */}
          {error && (
            <div className="mx-4 mb-2 flex items-center gap-2 p-3 rounded-lg bg-[var(--color-error)]/10 text-[var(--color-error)] text-sm">
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                className="ml-auto text-[var(--color-error)] hover:opacity-70 text-xs"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Input */}
          <ChatInput
            onSubmit={handleSubmit}
            onAbort={abort}
            isStreaming={isStreaming}
            placeholder="Ask anything..."
          />

          {/* Model info */}
          <div className="px-4 pb-2 text-[11px] text-[var(--color-text-tertiary)] text-center flex items-center justify-center gap-1">
            <Cpu size={10} />
            {providerConfigs[activeProvider]?.model || 'No model'} via{' '}
            {providerList.find((p) => p.id === activeProvider)?.name || activeProvider}
          </div>
        </>
      )}
    </div>
  )
}

function ServerStatus({ online }: { online: boolean }) {
  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs ${
        online
          ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
          : 'bg-[var(--color-error)]/10 text-[var(--color-error)]'
      }`}
    >
      {online ? <Wifi size={12} /> : <WifiOff size={12} />}
      {online ? 'Kilo Connected' : 'Kilo Offline'}
    </div>
  )
}