import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../../stores'
import { Cpu, Wifi, WifiOff } from 'lucide-react'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import * as Kilo from '../../utils/kiloClient'

const EMPTY_MESSAGES: never[] = []
const EMPTY_STREAMING = null

// Store Kilo message IDs that belong to the user, so we don't accidentally treat them as the assistant's streaming response
const ignoredMessageIDs = new Set<string>()

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
    commitStreamingMessage,
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
        if (!kiloSessionId || !part.messageID) return

        if (ignoredMessageIDs.has(part.messageID)) return

        const localId = useAppStore.getState().sessions.find(s => s.kiloId === kiloSessionId)?.id
        if (!localId) return

        const streaming = useAppStore.getState().streamingMessage[localId]
        if (streaming) {
          // If we see a message that's already in our store as a user message, ignore it
          const existingMessages = useAppStore.getState().sessionMessages[localId] || []
          const isUserMessage = existingMessages.some(m => m.info.id === part.messageID && m.info.role === 'user')
          
          if (isUserMessage) {
            ignoredMessageIDs.add(part.messageID)
            return
          }

          // Update messageID from real Kilo ID if still placeholder
          if (streaming.messageID.startsWith('pending-')) {
            updateStreamingMessageID(localId, part.messageID)
          }
          
          // Only process parts that belong to the current streaming message
          if (streaming.messageID === part.messageID || streaming.messageID.startsWith('pending-')) {
            updateStreamingPart(localId, part.id, part)
          }
        }
      },
      onPartDelta: (kiloSessionId, messageID, partID, delta) => {
        if (ignoredMessageIDs.has(messageID)) return
        const localId = useAppStore.getState().sessions.find(s => s.kiloId === kiloSessionId)?.id
        if (!localId) return

        const streaming = useAppStore.getState().streamingMessage[localId]
        if (streaming) {
          // If messageID is pending, this is likely the first delta for the assistant
          if (streaming.messageID.startsWith('pending-')) {
            updateStreamingMessageID(localId, messageID)
          }
          
          if (streaming.messageID === messageID || streaming.messageID.startsWith('pending-')) {
            appendStreamingDelta(localId, partID, delta)
          }
        }
      },
      onMessageUpdated: (info) => {
        const kiloSessionId = info.sessionID
        if (!kiloSessionId) return

        if (info.role === 'user') {
          ignoredMessageIDs.add(info.id)
          return
        }

        const localId = useAppStore.getState().sessions.find(s => s.kiloId === kiloSessionId)?.id
        if (!localId) return

        const streaming = useAppStore.getState().streamingMessage[localId]
        if (streaming) {
          const shouldAttachInfo =
            streaming.messageID === info.id || streaming.messageID.startsWith('pending-')

          if (streaming.messageID.startsWith('pending-')) {
            updateStreamingMessageID(localId, info.id)
          }

          if (shouldAttachInfo) {
            useAppStore.setState((state) => ({
              streamingMessage: {
                ...state.streamingMessage,
                [localId]: { ...state.streamingMessage[localId], info },
              },
            }))
          }
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
        const completedMessage = await Kilo.promptAsync(kiloId!, content, model)
        if (completedMessage?.info?.role === 'assistant') {
          commitStreamingMessage(activeSessionId, completedMessage)
        }
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
      commitStreamingMessage,
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
      <div className="flex-1 flex items-center justify-center bg-(--color-bg) relative overflow-hidden">
        {/* Deep ambient background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-(--color-accent)/5 rounded-full blur-[140px] pointer-events-none" />

        <div className="text-center relative z-10 px-8 max-w-lg">
          {/* Main Visual Group */}
          <div className="flex justify-center w-full mb-12">
            <div className="relative group">
              {/* Pulsing Back Glow */}
              <div className="absolute inset-0 bg-(--color-accent) opacity-10 blur-3xl group-hover:opacity-20 transition-opacity duration-700 rounded-full scale-150" />
              
              {/* Icon Container with Fluid Shape */}
              <div className="relative w-28 h-28 mx-auto rounded-[30%_70%_70%_30%_/_30%_30%_70%_70%] bg-white/60 dark:bg-white/5 border border-white/40 dark:border-white/10 flex items-center justify-center shadow-2xl backdrop-blur-2xl animate-float overflow-hidden">
                <Cpu size={48} className="text-(--color-accent) relative z-10 drop-shadow-[0_0_15px_rgba(var(--color-accent-rgb),0.4)]" />
                
                {/* Internal Animated Shimmer */}
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_3.5s_infinite]" />
              </div>

              {/* Orbiting Tech Particles */}
              <div className="absolute top-0 -right-4 w-5 h-5 rounded-full bg-(--color-accent) opacity-40 animate-pulse blur-[1px]" />
              <div className="absolute bottom-4 -left-6 w-3 h-3 rounded-full bg-(--color-accent-light) opacity-30 animate-bounce [animation-delay:0.8s] blur-[1px]" />
            </div>
          </div>

          {/* Typography */}
          <div className="space-y-4 mb-12">
            <h2 className="text-[36px] font-bold tracking-[-0.04em] text-(--color-text) leading-tight">
              Welcome to Snotra
            </h2>
            <p className="text-[15px] text-(--color-text-tertiary) leading-relaxed">
              Experience a calm, orchestrated workspace. Start a new conversation to begin your journey with AI.
            </p>
          </div>

          {/* Connection Status & CTA */}
          <div className="flex flex-col items-center gap-6">
            <ServerStatus online={serverOnline} />
            
            <div className="h-[1px] w-12 bg-(--color-border-light)" />
            
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-(--color-text-quaternary) animate-pulse">
              Select a session from the sidebar to start
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-transparent h-full w-full">
      {/* Offline status bar */}
      {!serverOnline && (
        <div className="mx-6 mt-5 rounded-xl px-4 py-2 text-xs flex items-center gap-2 bg-(--color-error)/10 text-(--color-error) border border-(--color-error)/20">
          <WifiOff size={12} />
          Kilo offline
        </div>
      )}

      {/* Messages or hero empty state */}
      {isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 relative overflow-hidden">
          {/* Ambient glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-(--color-accent)/3 rounded-full blur-[120px] pointer-events-none" />

          <div className="text-center relative z-10">
            {/* Label ABOVE icon */}
            <p className="section-kicker tracking-[0.3em] mb-6">Snotra Workspace</p>

            {/* Centered icon */}
            <div className="flex justify-center w-full mb-8">
              <div className="relative group">
                {/* Background Glow Effect */}
                <div className="absolute inset-0 bg-(--color-accent) opacity-20 blur-2xl group-hover:opacity-30 transition-opacity duration-500 rounded-full" />
                
                {/* Main Glass Icon Container */}
                <div className="relative w-24 h-24 rounded-[28%_72%_71%_29%_/_44%_40%_60%_56%] bg-white/80 dark:bg-white/10 border border-white/40 dark:border-white/20 flex items-center justify-center shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-xl animate-float overflow-hidden">
                  <Cpu size={40} className="text-(--color-accent) relative z-10 drop-shadow-[0_0_8px_rgba(var(--color-accent-rgb),0.3)]" />
                  
                  {/* Internal Shimmering Effect */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/30 to-transparent -translate-x-full animate-[shimmer_3s_infinite]" />
                </div>

                {/* Orbiting dots for extra "AI" tech feel */}
                <div className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-(--color-accent) animate-pulse" />
                <div className="absolute -bottom-1 -left-1 w-2 h-2 rounded-full bg-(--color-accent-light) animate-bounce [animation-delay:0.5s]" />
              </div>
            </div>

            {/* Heading below icon */}
            <h2 className="text-[40px] font-bold tracking-[-0.04em] text-(--color-text) leading-tight mb-3">
              How can I help?
            </h2>
            <p className="text-[15px] text-(--color-text-tertiary) max-w-lg mx-auto leading-relaxed mb-14">
              Seamlessly orchestrate your workspace, files, and AI agents from one minimalist interface.
            </p>
          </div>

          <div className="w-full max-w-(--chat-max-width) relative z-10">
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
            <div className="mx-8 mb-3 flex items-center gap-2 p-3 rounded-xl bg-(--color-error)/10 text-(--color-error) text-sm border border-(--color-error)/15">
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                className="ml-auto text-(--color-error) hover:opacity-70 text-xs"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Input Area Wrapper */}
          <div className="shrink-0 pt-3 relative z-10 bg-linear-to-t from-(--color-surface) via-(--color-surface)/95 to-transparent">
            {/* Input */}
            <ChatInput
              onSubmit={handleSubmit}
              onAbort={abort}
              isStreaming={isStreaming}
              placeholder="Ask anything..."
            />

            {/* Model info */}
            <div className="px-4 pb-6 text-[10px] text-(--color-text-tertiary) text-center flex items-center justify-center gap-2 opacity-50 hover:opacity-100 transition-all duration-500">
              <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-(--color-surface-secondary)/60 border border-(--color-border-light) backdrop-blur-md">
                <Cpu size={11} className="text-(--color-accent)/70" />
                <span className="font-bold uppercase tracking-widest">{providerConfigs[activeProvider]?.model || 'No model'}</span>
                <span className="opacity-40 px-1.5">•</span>
                <span className="font-bold uppercase tracking-widest">{providerList.find((p) => p.id === activeProvider)?.name || activeProvider}</span>
              </div>
            </div>
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
          ? 'bg-(--color-success)/10 text-(--color-success)'
          : 'bg-(--color-error)/10 text-(--color-error)'
      }`}
    >
      {online ? <Wifi size={12} /> : <WifiOff size={12} />}
      {online ? 'Kilo Connected' : 'Kilo Offline'}
    </div>
  )
}
