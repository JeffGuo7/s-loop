import { useState, useEffect } from 'react'
import { useAppStore } from '../../stores'
import { useKiloSession } from '../../hooks'
import { Send, Loader2, Square, AlertCircle, Wifi, WifiOff, Server, Cpu } from 'lucide-react'

export function ChatView() {
  const { activeSessionId, sessionMessages, providerConfigs, activeProvider, providerList } = useAppStore()
  const [input, setInput] = useState('')
  const {
    sendMessage,
    abort,
    isStreaming,
    streamingContent,
    error,
    serverOnline,
    checkHealth,
  } = useKiloSession()

  const messages = activeSessionId ? sessionMessages[activeSessionId] || [] : []

  useEffect(() => {
    checkHealth()
    const interval = setInterval(checkHealth, 30000)
    return () => clearInterval(interval)
  }, [checkHealth])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isStreaming) return

    const content = input.trim()
    setInput('')
    await sendMessage(content)
  }

  if (!activeSessionId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--color-background)]">
        <div className="text-center max-w-md space-y-4">
          <Server size={48} className="mx-auto text-[var(--color-text-secondary)] opacity-50" />
          <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">
            Welcome to Snotra
          </h2>
          <p className="text-[var(--color-text-secondary)]">
            Start a new conversation to begin
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
        {serverOnline ? (
          <Wifi size={12} />
        ) : (
          <WifiOff size={12} />
        )}
        {serverOnline ? 'Kilo connected' : 'Kilo offline — start with `kilo serve`'}
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && !isStreaming && (
          <div className="flex items-center justify-center h-full">
            <p className="text-[var(--color-text-secondary)]">
              Send a message to start the conversation
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`mb-4 ${msg.role === 'user' ? 'flex justify-end' : ''}`}
          >
            <div
              className={`max-w-[80%] px-4 py-3 rounded-lg ${
                msg.role === 'user'
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-surface)] border border-[var(--color-border)]'
              }`}
            >
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}

        {/* Streaming Content */}
        {isStreaming && streamingContent && (
          <div className="mb-4">
            <div className="max-w-[80%] px-4 py-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{streamingContent}</p>
            </div>
          </div>
        )}

        {/* Loading Indicator */}
        {isStreaming && !streamingContent && (
          <div className="flex items-center gap-2 text-[var(--color-text-secondary)]">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Thinking...</span>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--color-error)]/10 text-[var(--color-error)] text-sm mb-4">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 px-4 py-2 rounded-lg bg-[var(--color-surface-dim)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={abort}
              className="px-4 py-2 rounded-lg bg-[var(--color-error)] text-white hover:opacity-90 transition-opacity"
            >
              <Square size={18} />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              <Send size={18} />
            </button>
          )}
        </form>
        <p className="mt-2 text-xs text-[var(--color-text-secondary)] text-center flex items-center justify-center gap-1">
          <Cpu size={10} />
          {providerConfigs[activeProvider]?.model || 'No model'} via {providerList.find(p => p.id === activeProvider)?.name || activeProvider}
        </p>
      </div>
    </div>
  )
}

function ServerStatus({ online }: { online: boolean }) {
  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs ${
        online
          ? 'bg-green-500/10 text-green-600'
          : 'bg-red-500/10 text-red-500'
      }`}
    >
      {online ? <Wifi size={12} /> : <WifiOff size={12} />}
      {online ? 'Kilo Connected' : 'Kilo Offline'}
    </div>
  )
}
