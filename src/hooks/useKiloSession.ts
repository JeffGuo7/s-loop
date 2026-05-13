import { useState, useRef, useCallback } from 'react'
import { useAppStore } from '../stores'
import * as Kilo from '../utils/kiloClient'

export function useKiloSession() {
  const { activeSessionId, sessions, addMessage, updateSessionTitle } = useAppStore()
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [serverOnline, setServerOnline] = useState(false)
  const msgId = useRef('')

  const sendMessage = useCallback(
    async (content: string) => {
      if (!activeSessionId) {
        setError('No active session')
        return
      }

      const session = sessions.find((s) => s.id === activeSessionId)
      if (!session) return

      setError(null)
      setIsStreaming(true)
      setStreamingContent('')

      // Add user message to local store
      addMessage(activeSessionId, {
        id: Math.random().toString(36).substring(2, 15),
        role: 'user',
        content,
        timestamp: Date.now(),
      })

      let full = ''

      try {
        // Ensure a Kilo session exists
        let kiloId = session.kiloId
        if (!kiloId) {
          const ks = await Kilo.createSession(session.title)
          kiloId = ks.id
          // Cache kiloId in local session
          const { sessions: all } = useAppStore.getState()
          const updated = all.map((s) =>
            s.id === activeSessionId ? { ...s, kiloId } : s,
          )
          useAppStore.setState({ sessions: updated })
        }

        await Kilo.prompt(kiloId, content, {
          onToken: (token) => {
            full += token
            setStreamingContent(full)
          },
          onThinking: (_thought) => {
            // Could display thinking state
          },
          onToolStart: (_name, _input) => {
            // Could display tool use in UI
          },
          onToolComplete: (_name, _output) => {
            // Tool completed
          },
          onComplete: () => {
            if (full) {
              addMessage(activeSessionId, {
                id: msgId.current || Math.random().toString(36).substring(2, 15),
                role: 'assistant',
                content: full,
                timestamp: Date.now(),
              })

              // Update session title from first exchange
              const msgs = useAppStore.getState().sessionMessages[activeSessionId]
              if (msgs && msgs.length <= 2 && session.title === 'New Chat') {
                const title = content.slice(0, 40) + (content.length > 40 ? '...' : '')
                updateSessionTitle(activeSessionId, title)
              }
            }
            setIsStreaming(false)
            setStreamingContent('')
          },
          onError: (err) => {
            setError(err.message)
            setIsStreaming(false)
            setStreamingContent('')
          },
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
          setServerOnline(false)
          setError('Kilo server not reachable. Start it with: kilo serve')
        } else {
          setError(msg)
        }
        setIsStreaming(false)
        setStreamingContent('')
      }
    },
    [activeSessionId, sessions, addMessage, updateSessionTitle],
  )

  const abort = useCallback(() => {
    Kilo.abortPrompt()
    setIsStreaming(false)
    setStreamingContent('')
  }, [])

  const checkHealth = useCallback(async () => {
    const ok = await Kilo.health()
    setServerOnline(ok)
    return ok
  }, [])

  return {
    sendMessage,
    abort,
    isStreaming,
    streamingContent,
    error,
    serverOnline,
    checkHealth,
  }
}
