import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../../stores'
import { Send, Square, AlertCircle, Wifi, WifiOff, Cpu } from 'lucide-react'
import { MessageList } from './MessageList'
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

  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [serverOnline, setServerOnline] = useState(false)

  // Check Kilo health
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isStreaming || !activeSessionId) return

    const content = input.trim()
    setInput('')
    setError(null)

    // Get model config
    const providerConfig = activeProvider ? providerConfigs[activeProvider] : null
    const model = providerConfig?.model
      ? { providerID: activeProvider!, modelID: providerConfig.model }
      : undefined

    if (!model) {
      setError('No model selected. Please configure a provider in Settings.')
      return
    }

    // Add user message
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

    // Update session title if first message
    if (session && session.title === 'New Chat') {
      updateSessionTitle(activeSessionId, content.slice(0, 40) + (content.length > 40 ? '...' : ''))
    }

    setIsStreaming(true)

    // Ensure Kilo session exists
    let kiloId = session?.kiloId
    if (!kiloId) {
      try {
        const ks = await Kilo.createSession(session?.title)
        kiloId = ks.id
        // Update session with kiloId
        useAppStore.setState((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === activeSessionId ? { ...s, kiloId } : s
          ),
        }))
      } catch (err) {
        setError('Failed to create Kilo session')
        setIsStreaming(false)
        return
      }
    }

    // Start streaming
    const assistantMessageID = Math.random().toString(36).substring(2, 15)
    startStreaming(activeSessionId, assistantMessageID)

    try {
      await Kilo.prompt(kiloId!, content, {
        onPartUpdated: (_sessionID, _messageID, partID, part) => {
          console.log('[ChatView] onPartUpdated:', partID, part.type, part)
          updateStreamingPart(activeSessionId, partID, part)
        },
        onPartDelta: (_sessionID, _messageID, partID, delta) => {
          console.log('[ChatView] onPartDelta:', partID, delta)
          appendStreamingDelta(activeSessionId, partID, delta)
        },
        onMessageUpdated: (_sessionID, _messageID, info) => {
          console.log('[ChatView] onMessageUpdated:', info)
          // Update message metadata
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
        onComplete: (_messageID) => {
          console.log('[ChatView] onComplete:', _messageID)
          finishStreaming(activeSessionId)
          setIsStreaming(false)
        },
        onError: (err) => {
          console.error('[ChatView] onError:', err)
          setError(err.message)
          finishStreaming(activeSessionId)
          setIsStreaming(false)
        },
      }, model)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[ChatView] catch:', msg)
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        setServerOnline(false)
        setError('Kilo server not reachable')
      } else {
        setError(msg)
      }
      // Don't call finishStreaming here - onError callback handles it
      setIsStreaming(false)
    }
  }

  const abort = useCallback(() => {
    Kilo.abortPrompt()
    setIsStreaming(false)
    finishStreaming(activeSessionId || '')
  }, [activeSessionId])

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
    <div className="flex-1 flex flex-col bg-[var(--color-background)]">
      {/* Server status bar */}
      <div
        className={`px-4 py-1.5 text-xs flex items-center gap-2 border-b ${
          serverOnline
            ? 'bg-green-500/10 text-green-600 border-green-500/20'
            : 'bg-red-500/10 text-red-500 border-red-500/20'
        }`}
      >
        {serverOnline ? <Wifi size={12} /> : <WifiOff size={12} />}
        {serverOnline ? 'Kilo connected' : 'Kilo offline'}
      </div>

      {/* Messages */}
      <MessageList sessionId={activeSessionId} />

      {/* Error Display */}
      {error && (
        <div className="mx-4 mb-2 flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-500 text-sm">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 px-4 py-3 rounded-xl bg-[var(--color-surface-dim)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={abort}
              className="px-4 py-3 rounded-xl bg-red-500 text-white hover:opacity-90 transition-opacity"
            >
              <Square size={18} />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-4 py-3 rounded-xl bg-[var(--color-primary)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              <Send size={18} />
            </button>
          )}
        </form>
        <p className="mt-2 text-xs text-[var(--color-text-secondary)] text-center flex items-center justify-center gap-1">
          <Cpu size={10} />
          {providerConfigs[activeProvider]?.model || 'No model'} via{' '}
          {providerList.find((p) => p.id === activeProvider)?.name || activeProvider}
        </p>
      </div>
    </div>
  )
}

function ServerStatus({ online }: { online: boolean }) {
  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs ${
        online ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-500'
      }`}
    >
      {online ? <Wifi size={12} /> : <WifiOff size={12} />}
      {online ? 'Kilo Connected' : 'Kilo Offline'}
    </div>
  )
}