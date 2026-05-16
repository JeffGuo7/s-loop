import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../../stores'
import { Cpu, Wifi, WifiOff } from 'lucide-react'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import * as Kilo from '../../utils/kiloClient'

export function ChatView() {
  const {
    activeSessionId,
    sessions,
    providerConfigs,
    activeProvider,
    providerList,
    startStreaming,
    updateStreamingPart,
    appendStreamingDelta,
    finishStreaming,
    addMessage,
    updateSessionTitle,
  } = useAppStore()

  const [error, setError] = useState<string | null>(null)
  const [serverOnline, setServerOnline] = useState(false)

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
  const messages = activeSessionId
    ? useAppStore.getState().sessionMessages[activeSessionId] || []
    : []
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
        parts: [{ id: `${userMessageID}-0`, type: 'text', text: content }],
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

      const assistantMessageID = Math.random().toString(36).substring(2, 15)
      startStreaming(activeSessionId, assistantMessageID)

      try {
        await Kilo.prompt(kiloId!, content, {
          onPartUpdated: (_sessionID, _messageID, partID, part) => {
            updateStreamingPart(activeSessionId, partID, part)
          },
          onPartDelta: (_sessionID, _messageID, partID, delta) => {
            appendStreamingDelta(activeSessionId, partID, delta)
          },
          onMessageUpdated: (_sessionID, _messageID, info) => {
            useAppStore.setState((state) => {
              const streaming = state.streamingMessage[activeSessionId]
              if (!streaming) return state
              return {
                streamingMessage: {
                  ...state.streamingMessage,
                  [activeSessionId]: { ...streaming, info },
                },
              }
            })
          },
          onComplete: () => {
            finishStreaming(activeSessionId)
          },
          onError: (err) => {
            setError(err.message)
            finishStreaming(activeSessionId)
          },
        }, model)
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
      updateStreamingPart,
      appendStreamingDelta,
      finishStreaming,
      addMessage,
      updateSessionTitle,
    ],
  )

  const abort = useCallback(() => {
    Kilo.abortPrompt()
    if (activeSessionId) finishStreaming(activeSessionId)
  }, [activeSessionId, finishStreaming])

  const streamingMessage = activeSessionId
    ? useAppStore.getState().streamingMessage[activeSessionId]
    : null
  const isStreaming = streamingMessage?.isStreaming ?? false

  if (!activeSessionId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--color-background)]">
        <div className="text-center max-w-md space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-[var(--color-surface-dim)] flex items-center justify-center">
            <Cpu size={32} className="text-[var(--color-text-secondary)]" />
          </div>
          <h2 className="text-2xl font-bold">Welcome to Snotra</h2>
          <p className="text-[var(--color-text-secondary)]">
            Start a new conversation to begin chatting with AI
          </p>
          <ServerStatus online={serverOnline} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-[var(--color-background)] h-full">
      {/* Offline status bar - only shown when disconnected */}
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
            <div className="w-14 h-14 mx-auto rounded-full bg-[var(--color-surface-dim)] flex items-center justify-center">
              <Cpu size={28} className="text-[var(--color-text-secondary)]" />
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