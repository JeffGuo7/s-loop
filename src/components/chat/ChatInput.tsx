import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Square } from 'lucide-react'

interface ChatInputProps {
  onSubmit: (content: string) => void
  onAbort?: () => void
  isStreaming?: boolean
  disabled?: boolean
  placeholder?: string
  variant?: 'default' | 'hero'
}

export function ChatInput({
  onSubmit,
  onAbort,
  isStreaming = false,
  disabled = false,
  placeholder = 'Ask anything...',
  variant = 'default',
}: ChatInputProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const composingRef = useRef(false)

  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [])

  useEffect(() => {
    autoResize()
  }, [input, autoResize])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !composingRef.current) {
        e.preventDefault()
        if (input.trim() && !isStreaming && !disabled) {
          onSubmit(input.trim())
          setInput('')
          if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'
          }
        }
      }
    },
    [input, isStreaming, disabled, onSubmit],
  )

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true
  }, [])

  const handleCompositionEnd = useCallback(() => {
    composingRef.current = false
  }, [])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (input.trim() && !isStreaming && !disabled) {
        onSubmit(input.trim())
        setInput('')
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto'
        }
      }
    },
    [input, isStreaming, disabled, onSubmit],
  )

  const isHero = variant === 'hero'

  return (
    <div
      className={
        isHero
          ? 'mx-auto max-w-3xl w-full px-4 mb-8'
          : 'px-6 py-6 max-w-[var(--chat-max-width)] mx-auto w-full'
      }
    >
      <form onSubmit={handleSubmit}>
        <div
          className={`relative group transition-all duration-300 ${
            isHero ? 'glass-panel rounded-2xl shadow-2xl' : 'bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-lg border border-[var(--color-border)] p-2'
          }`}
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              placeholder={placeholder}
              disabled={disabled || isStreaming}
              rows={1}
              className="flex-1 px-4 py-3 bg-transparent border-none focus:ring-0 resize-none text-sm leading-relaxed min-h-[46px] max-h-[200px] custom-scrollbar text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)]"
            />
            
            <div className="flex items-center gap-2 pb-1 pr-1">
              {isStreaming ? (
                <button
                  type="button"
                  onClick={onAbort}
                  className="w-10 h-10 flex items-center justify-center rounded-xl bg-[var(--color-error)] text-white hover:scale-105 active:scale-95 transition-all shadow-lg shadow-red-500/20"
                >
                  <Square size={16} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim() || disabled}
                  className="w-10 h-10 flex items-center justify-center rounded-xl bg-[var(--color-primary)] text-white hover:scale-105 active:scale-95 disabled:opacity-30 disabled:scale-100 disabled:cursor-not-allowed transition-all shadow-lg shadow-[var(--color-primary)]/20"
                >
                  <Send size={18} strokeWidth={2.5} className={input.trim() ? 'translate-x-0.5 -translate-y-0.5' : ''} />
                </button>
              )}
            </div>
          </div>
          
          {!isHero && (
            <div className="absolute -top-6 left-4 flex gap-3">
               <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] opacity-40">Shift + Enter for new line</span>
            </div>
          )}
        </div>
      </form>
    </div>
  )
}