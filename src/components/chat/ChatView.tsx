import { useState } from 'react';
import { useAppStore } from '../../stores';
import { useAI } from '../../hooks';
import { Send, Loader2, Square, AlertCircle } from 'lucide-react';
import type { ChatMessage } from '../../utils/ai';

export function ChatView() {
  const { activeSessionId, sessionMessages, addMessage, providerConfigs, activeProvider } = useAppStore();
  const [input, setInput] = useState('');
  const { sendMessage, abort, isStreaming, streamingContent, error } = useAI();

  const messages = activeSessionId ? sessionMessages[activeSessionId] || [] : [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userContent = input.trim();
    setInput('');

    // Add user message
    if (activeSessionId) {
      addMessage(activeSessionId, {
        id: Math.random().toString(36).substring(2, 15),
        role: 'user',
        content: userContent,
        timestamp: Date.now(),
      });
    }

    // Convert session messages to ChatMessage format for context
    const conversationHistory: ChatMessage[] = messages.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));

    await sendMessage(userContent, conversationHistory);
  };

  if (!activeSessionId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--color-background)]">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">
            Welcome to Snotra
          </h2>
          <p className="text-[var(--color-text-secondary)] mb-4">
            Start a new conversation to begin
          </p>
          {!providerConfigs[activeProvider].apiKey && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--color-warning)]/10 text-[var(--color-warning)] text-sm">
              <AlertCircle size={16} />
              <span>Please configure your API key in Settings</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[var(--color-background)]">
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
            className={`mb-4 ${
              msg.role === 'user' ? 'flex justify-end' : ''
            }`}
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
        <p className="mt-2 text-xs text-[var(--color-text-secondary)] text-center">
          Using {providerConfigs[activeProvider].model} ({activeProvider})
        </p>
      </div>
    </div>
  );
}