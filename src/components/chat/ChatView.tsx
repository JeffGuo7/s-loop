import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore, useAgentStore } from '../../stores'
import { Cpu, Sparkles, Wifi, WifiOff } from 'lucide-react'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import * as Kilo from '../../utils/kiloClient'
import { motion, AnimatePresence } from 'framer-motion'

const EMPTY_MESSAGES: never[] = []
const EMPTY_STREAMING = null

// Store Kilo message IDs that belong to the user, so we don't accidentally treat them as the assistant's streaming response
const ignoredMessageIDs = new Set<string>()

export function ChatView() {
  const { t } = useTranslation()
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

      if (!providerConfig) {
        setError(t('chat.errors.noProvider'))
        return
      }

      if (!providerConfig.apiKey) {
        setError(t('chat.errors.noApiKey'))
        return
      }

      if (!model) {
        setError(t('chat.errors.noModel'))
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
          setError(t('chat.errors.sessionFailed'))
          return
        }
      }

      // Start streaming — messageID will be updated from SSE events
      const assistantMessageID = `pending-${Date.now()}`
      startStreaming(activeSessionId, assistantMessageID)

      // Send prompt async — all updates come through SSE
      try {
        // Inject active agent context
        const agentStore = useAgentStore.getState()
        const activeAgent = agentStore.activeAgentId
          ? agentStore.agents.find((a) => a.id === agentStore.activeAgentId)
          : null

        let enrichedContent = content
        if (activeAgent && (activeAgent.skills.length > 0 || activeAgent.mcpTools.length > 0)) {
          const contexts: string[] = []
          if (activeAgent.skills.length > 0) {
            contexts.push(`Active Skills: ${activeAgent.skills.join(', ')}`)
          }
          if (activeAgent.mcpTools.length > 0) {
            contexts.push(`Active MCP Tools: ${activeAgent.mcpTools.map((t) => `${t.serverName}/${t.toolName}`).join(', ')}`)
          }
          enrichedContent = `[Agent: ${activeAgent.name}]\n${contexts.join('\n')}\n\n${content}`
        }

        const completedMessage = await Kilo.promptAsync(kiloId!, enrichedContent, model)
        if (completedMessage?.info?.role === 'assistant') {
          commitStreamingMessage(activeSessionId, completedMessage)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
          setServerOnline(false)
          setError(t('chat.errors.serverUnreachable'))
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
      t,
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
      <div className="flex-1 flex flex-col items-center justify-center bg-transparent relative selection:bg-accent/10">
        <div className="relative z-10 w-full flex flex-col items-center justify-center text-center px-4 sm:px-8 max-w-4xl mx-auto h-full">
          {/* Main Visual Group */}
          <div className="mb-4 sm:mb-8 shrink-0">
            <div className="relative group scale-75 sm:scale-90 transition-transform duration-700">
              <div className="absolute inset-0 bg-accent/10 blur-[40px] group-hover:bg-accent/20 transition-all duration-1000 rounded-full scale-125" />
              <div className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-[32%_68%_55%_45%/45%_35%_65%_55%] bg-white/95 dark:bg-white/5 border border-white/40 dark:border-white/10 flex items-center justify-center shadow-2xl backdrop-blur-3xl animate-liquid overflow-hidden">
                <Cpu size={32} className="sm:hidden text-accent drop-shadow-[0_4px_16px_rgba(var(--color-accent-rgb),0.4)]" />
                <Cpu size={48} className="hidden sm:block text-accent drop-shadow-[0_8px_24px_rgba(var(--color-accent-rgb),0.5)]" />
              </div>
              <motion.div 
                animate={{ y: [0, -8, 0], x: [0, 4, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -top-2 -right-2 sm:-top-4 sm:-right-4 w-6 h-6 sm:w-10 sm:h-10 rounded-full bg-surface border border-border-light shadow-xl flex items-center justify-center text-accent/40 backdrop-blur-xl"
              >
                <Sparkles size={12} className="sm:hidden" />
                <Sparkles size={20} className="hidden sm:block" />
              </motion.div>
            </div>
          </div>

          {/* Typography */}
          <div className="space-y-3 sm:space-y-6 mb-6 sm:mb-12 w-full">
            <h2 className="text-3xl sm:text-5xl lg:text-[4.5rem] font-bold tracking-tight text-text leading-tight drop-shadow-sm select-none">
              {t('chat.welcome.title')} <span className="text-accent italic font-serif px-1">{t('chat.welcome.appName')}</span>
            </h2>
            <div className="flex justify-center w-full">
              <p className="text-sm sm:text-base lg:text-lg text-text-tertiary leading-relaxed max-w-lg sm:max-w-xl font-medium tracking-tight opacity-70 text-center">
                {t('chat.welcome.description')}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center gap-8 sm:gap-12">
            <ServerStatus online={serverOnline} />
            <div className="flex items-center gap-8">
              <div className="h-px w-12 bg-border-light" />
              <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-accent/40">{t('chat.welcome.newConversation')}</p>
              <div className="h-px w-12 bg-border-light" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-transparent h-full w-full overflow-hidden">
      {/* Offline status bar */}
      {!serverOnline && (
        <div className="mx-12 mt-8 rounded-[24px] px-6 py-4 text-[14px] font-bold flex items-center gap-4 bg-red-500/10 text-red-500 border border-red-500/20 animate-fade-in shadow-sm z-20 shrink-0">
          <WifiOff size={18} />
          <span>{t('chat.status.kiloUnreachable')}</span>
        </div>
      )}

      {/* Main content area - Takes all space */}
      <div className="flex-1 min-h-0 relative bg-transparent">
        <AnimatePresence mode="wait">
          {isEmpty ? (
            <motion.div 
              key="empty"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="h-full flex flex-col items-center justify-center px-16 relative pb-48"
            >
              <div className="text-center relative z-10 w-full flex flex-col items-center">
                <p className="text-[10px] font-bold tracking-[0.4em] uppercase text-accent opacity-50 mb-8">{t('chat.welcome.subtitle')}</p>

                <div className="flex justify-center w-full mb-8">
                  <div className="relative group scale-90">
                    <div className="absolute inset-0 bg-accent opacity-30 blur-[80px] group-hover:opacity-50 transition-opacity duration-700 rounded-full scale-110" />
                    <div className="relative w-32 h-32 rounded-[35%_65%_60%_40%/45%_35%_65%_55%] bg-white/95 dark:bg-white/10 border border-white/60 dark:border-white/20 flex items-center justify-center shadow-4xl backdrop-blur-3xl animate-float overflow-hidden">
                      <Cpu size={48} className="text-accent drop-shadow-[0_0_24px_rgba(var(--color-accent-rgb),0.5)]" />
                      <div className="absolute inset-0 bg-linear-to-tr from-transparent via-white/50 to-transparent -translate-x-full animate-[shimmer_3.5s_infinite]" />
                    </div>
                  </div>
                </div>

                <h2 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-text leading-none mb-6 drop-shadow-sm text-center">
                  {t('chat.welcome.howCanIHelp')}
                </h2>
                <p className="text-sm sm:text-base lg:text-lg text-text-tertiary max-w-xl leading-relaxed font-bold opacity-70 text-center">
                  {t('chat.welcome.emptyDesc')}
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key={activeSessionId}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="h-full flex flex-col w-full max-w-(--spacing-chat-max) mx-auto relative overflow-hidden"
            >
              <MessageList sessionId={activeSessionId!} />
              
              {error && (
                <div className="absolute top-8 left-4 right-4 z-20 flex items-center gap-4 p-6 rounded-[24px] bg-red-500/10 text-red-500 text-[14px] font-bold border border-red-500/15 animate-shake shadow-sm backdrop-blur-md">
                  <span>{error}</span>
                  <button
                    onClick={() => setError(null)}
                    className="ml-auto text-red-500 hover:opacity-70 text-[10px] font-bold uppercase tracking-[0.2em]"
                  >
                    {t('chat.errors.dismiss')}
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input Area - Now absolute within the relative parent to overlay messages correctly */}
        <div className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none">
          <div className="bg-linear-to-t from-bg via-bg/95 to-transparent pt-12 pb-2 pointer-events-auto">
            <div className="w-full max-w-(--spacing-chat-max) mx-auto relative px-4">
              <ChatInput
                onSubmit={handleSubmit}
                onAbort={abort}
                isStreaming={isStreaming}
                placeholder={t('chat.input.placeholder')}
              />

              {/* Model & Agent info */}
              <div className="mt-2 pb-2 text-[10px] text-text-tertiary text-center flex items-center justify-center gap-4 opacity-20 hover:opacity-100 transition-all duration-700 scale-90 origin-bottom">
                <div className="flex items-center gap-3 px-5 py-1.5 rounded-full bg-surface-secondary/80 border border-border-light backdrop-blur-3xl shadow-sm hover:shadow-accent/5 hover:border-accent/20 transition-all">
                  <Cpu size={12} className="text-accent/60" />
                  <span className="font-bold uppercase tracking-[0.2em]">{providerConfigs[activeProvider]?.model || t('chat.status.noModel')}</span>
                  <span className="opacity-10 px-1">|</span>
                  <span className="font-bold uppercase tracking-[0.2em]">{providerList.find((p) => p.id === activeProvider)?.name || activeProvider}</span>
                  {(() => {
                    const agent = useAgentStore.getState().activeAgentId
                      ? useAgentStore.getState().agents.find((a) => a.id === useAgentStore.getState().activeAgentId)
                      : null
                    return agent ? (
                      <>
                        <span className="opacity-10 px-1">|</span>
                        <span className="font-bold">{agent.avatar} {agent.name}</span>
                      </>
                    ) : null
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ServerStatus({ online }: { online: boolean }) {
  const { t } = useTranslation()
  return (
    <div
      className={`inline-flex items-center gap-3 px-6 py-3 rounded-full text-[13px] font-bold tracking-widest shadow-sm backdrop-blur-md border ${
        online
          ? 'bg-green-500/10 text-green-600 border-green-500/20'
          : 'bg-red-500/10 text-red-600 border-red-500/20'
      }`}
    >
      {online ? <Wifi size={16} /> : <WifiOff size={16} />}
      <span className="uppercase tracking-widest">{online ? t('chat.status.kiloConnected') : t('chat.status.kiloOffline')}</span>
    </div>
  )
}
