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
      <div className="flex-1 flex items-center justify-center bg-bg relative overflow-hidden">
        {/* Deep ambient background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1400px] h-[1400px] bg-accent/5 rounded-full blur-[240px] pointer-events-none" />

        <div className="text-center relative z-10 px-32 max-w-5xl">
          {/* Main Visual Group */}
          <div className="flex justify-center w-full mb-32">
            <div className="relative group">
              {/* Pulsing Back Glow */}
              <div className="absolute inset-0 bg-accent opacity-25 blur-[120px] group-hover:opacity-40 transition-opacity duration-1000 rounded-full scale-150" />
              
              {/* Icon Container with Fluid Shape - Fine-tuned for visual centering */}
              <div className="relative w-56 h-56 mx-auto rounded-[38%_62%_63%_37%/41%_44%_56%_59%] bg-white/90 dark:bg-white/5 border border-white/50 dark:border-white/20 flex items-center justify-center shadow-4xl backdrop-blur-3xl animate-float overflow-hidden">
                <div className="relative z-10 flex items-center justify-center">
                  <Cpu size={96} className="text-accent drop-shadow-[0_0_40px_rgba(var(--color-accent-rgb),0.6)]" />
                </div>
                
                {/* Internal Animated Shimmer */}
                <div className="absolute inset-0 bg-linear-to-tr from-transparent via-white/40 to-transparent -translate-x-full animate-[shimmer_4s_infinite]" />
              </div>

              {/* Orbiting Tech Particles */}
              <div className="absolute -top-10 -right-12 w-12 h-12 rounded-full bg-accent opacity-50 animate-pulse blur-[1.5px]" />
              <div className="absolute bottom-12 -left-20 w-10 h-10 rounded-full bg-accent-light opacity-40 animate-bounce [animation-delay:1.2s] blur-[1.5px]" />
            </div>
          </div>

          {/* Typography */}
          <div className="space-y-12 mb-32">
            <h2 className="text-9xl font-bold tracking-tightest text-text leading-none drop-shadow-sm">
              Welcome to Snotra
            </h2>
            <p className="text-[26px] text-text-tertiary leading-relaxed max-w-2xl mx-auto font-bold opacity-70">
              Experience a calm, orchestrated workspace. Start a new conversation to begin your journey with AI.
            </p>
          </div>

          {/* Connection Status & CTA */}
          <div className="flex flex-col items-center gap-16">
            <ServerStatus online={serverOnline} />
            
            <div className="h-px w-48 bg-border-light opacity-50" />
            
            <p className="text-[14px] font-bold uppercase tracking-[0.6em] text-accent animate-pulse opacity-50">
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
        <div className="mx-24 mt-12 rounded-[40px] px-10 py-6 text-[16px] font-bold flex items-center gap-6 bg-red-500/10 text-red-500 border border-red-500/20 animate-fade-in shadow-sm">
          <WifiOff size={22} />
          <span>Kilo server is currently unreachable</span>
        </div>
      )}

      {/* Messages or hero empty state */}
      {isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center px-32 relative overflow-hidden">
          {/* Ambient glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[1200px] bg-accent/6 rounded-full blur-[200px] pointer-events-none" />

          <div className="text-center relative z-10 w-full">
            {/* Label ABOVE icon */}
            <p className="text-[14px] font-bold tracking-[0.7em] uppercase text-accent opacity-50 mb-20">Snotra Workspace</p>

            {/* Centered icon */}
            <div className="flex justify-center w-full mb-20">
              <div className="relative group">
                {/* Background Glow Effect */}
                <div className="absolute inset-0 bg-accent opacity-30 blur-[120px] group-hover:opacity-50 transition-opacity duration-700 rounded-full scale-125" />
                
                {/* Main Glass Icon Container */}
                <div className="relative w-52 h-52 rounded-[35%_65%_60%_40%/45%_35%_65%_55%] bg-white/95 dark:bg-white/10 border border-white/60 dark:border-white/20 flex items-center justify-center shadow-4xl backdrop-blur-3xl animate-float overflow-hidden">
                  <div className="relative z-10 flex items-center justify-center">
                    <Cpu size={84} className="text-accent drop-shadow-[0_0_30px_rgba(var(--color-accent-rgb),0.5)]" />
                  </div>
                  
                  {/* Internal Shimmering Effect */}
                  <div className="absolute inset-0 bg-linear-to-tr from-transparent via-white/50 to-transparent -translate-x-full animate-[shimmer_3.5s_infinite]" />
                </div>

                {/* Orbiting dots */}
                <div className="absolute -top-6 -right-6 w-10 h-10 rounded-full bg-accent animate-pulse shadow-[0_0_20px_var(--color-accent)]" />
                <div className="absolute -bottom-5 -left-5 w-8 h-8 rounded-full bg-accent-light animate-bounce [animation-delay:0.7s]" />
              </div>
            </div>

            {/* Heading below icon */}
            <h2 className="text-[96px] font-bold tracking-tightest text-text leading-none mb-12 drop-shadow-sm">
              How can I help?
            </h2>
            <p className="text-[24px] text-text-tertiary max-w-3xl mx-auto leading-relaxed mb-32 font-bold opacity-70">
              Seamlessly orchestrate your workspace, files, and AI agents from one minimalist interface.
            </p>
          </div>

          <div className="w-full max-w-[1000px] relative z-10">
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
            <div className="mx-24 mb-10 flex items-center gap-6 p-8 rounded-[40px] bg-red-500/10 text-red-500 text-[16px] font-bold border border-red-500/15 animate-shake shadow-sm">
              <span>{error}</span>
              <button
                onClick={() => setError(null)}
                className="ml-auto text-red-500 hover:opacity-70 text-xs font-bold uppercase tracking-[0.3em]"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Input Area Wrapper */}
          <div className="shrink-0 pt-10 relative z-10 bg-linear-to-t from-bg via-bg/95 to-transparent">
            {/* Input */}
            <ChatInput
              onSubmit={handleSubmit}
              onAbort={abort}
              isStreaming={isStreaming}
              placeholder="Ask anything..."
            />

            {/* Model info */}
            <div className="px-12 pb-16 text-[13px] text-text-tertiary text-center flex items-center justify-center gap-6 opacity-30 hover:opacity-100 transition-all duration-700">
              <div className="flex items-center gap-5 px-10 py-4 rounded-full bg-surface-secondary/90 border border-border-light backdrop-blur-3xl shadow-sm hover:shadow-accent/10 hover:border-accent/30 transition-all">
                <Cpu size={18} className="text-accent/70" />
                <span className="font-bold uppercase tracking-[0.4em]">{providerConfigs[activeProvider]?.model || 'No model'}</span>
                <span className="opacity-20 px-3 font-light">|</span>
                <span className="font-bold uppercase tracking-[0.4em]">{providerList.find((p) => p.id === activeProvider)?.name || activeProvider}</span>
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
      className={`inline-flex items-center gap-3 px-6 py-3 rounded-full text-[13px] font-bold tracking-widest shadow-sm backdrop-blur-md border ${
        online
          ? 'bg-green-500/10 text-green-600 border-green-500/20'
          : 'bg-red-500/10 text-red-600 border-red-500/20'
      }`}
    >
      {online ? <Wifi size={16} /> : <WifiOff size={16} />}
      <span className="uppercase tracking-widest">{online ? 'Kilo Connected' : 'Kilo Offline'}</span>
    </div>
  )
}
