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
          ? 'mx-auto max-w-3xl w-full px-4'
          : 'border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3'
      }
    >
      <form onSubmit={handleSubmit}>
        <div
          className={
            isHero
              ? 'glass-panel rounded-t-xl p-4'
              : 'flex gap-2 items-end'
          }
        >
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
            className={
              isHero
                ? 'w-full px-4 py-3 rounded-xl bg-[var(--color-surface-dim)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-primary)] transition-colors resize-none text-sm leading-relaxed min-h-[44px]'
                : 'flex-1 px-4 py-3 rounded-xl bg-[var(--color-surface-dim)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-primary)] transition-colors resize-none text-sm leading-relaxed min-h-[44px]'
            }
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={onAbort}
              className="px-4 py-3 rounded-xl bg-[var(--color-error)] text-white hover:opacity-90 transition-opacity shrink-0"
            >
              <Square size={18} />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() || disabled}
              className="px-4 py-3 rounded-xl bg-[var(--color-primary)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity shrink-0"
            >
              <Send size={18} />
            </button>
          )}
        </div>
      </form>
    </div>
  )
}