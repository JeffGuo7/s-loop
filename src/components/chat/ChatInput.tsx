import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Square, X, File } from 'lucide-react'

interface FileAttachment {
  path: string
  name: string
}

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
  const [attachments, setAttachments] = useState<FileAttachment[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
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

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }, [])

  // Listen for file-attach events from the file tree (click / mobile)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as FileAttachment
      if (detail?.path) {
        setAttachments((prev) => {
          // Avoid duplicates
          if (prev.some((a) => a.path === detail.path)) return prev
          return [...prev, detail]
        })
      }
    }
    window.addEventListener('snotra-file-attach', handler)
    return () => window.removeEventListener('snotra-file-attach', handler)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const newAttachments: FileAttachment[] = []

    // Internal file drag (from FileTree) — path is in dataTransfer
    const fileData = e.dataTransfer.getData('application/x-snotra-file')
    if (fileData) {
      try {
        const { path, name } = JSON.parse(fileData)
        newAttachments.push({ path, name })
      } catch {
        // ignore malformed data
      }
    } else {
      // OS file drop — only filename available, no real path
      const files = Array.from(e.dataTransfer.files)
      for (const file of files) {
        newAttachments.push({ path: file.name, name: file.name })
      }
    }

    if (newAttachments.length > 0) {
      setAttachments((prev) => {
        const existing = new Set(prev.map((a) => a.path))
        const fresh = newAttachments.filter((a) => !existing.has(a.path))
        return [...prev, ...fresh]
      })
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragOver(false)
  }, [])

  const submitWithAttachments = useCallback(() => {
    if (!input.trim() && attachments.length === 0) return

    const parts: string[] = []

    // File references — just the path, no content embedded
    for (const att of attachments) {
      if (att.path) {
        parts.push(`[File: ${att.name}](${att.path})`)
      } else {
        parts.push(`[File: ${att.name}]`)
      }
    }

    const userText = input.trim()
    if (userText) parts.push(userText)

    onSubmit(parts.join('\n'))
    setInput('')
    setAttachments([])
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }, [input, attachments, onSubmit])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !composingRef.current) {
        e.preventDefault()
        if ((input.trim() || attachments.length > 0) && !isStreaming && !disabled) {
          submitWithAttachments()
        }
      }
    },
    [input, attachments, isStreaming, disabled, submitWithAttachments],
  )

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      submitWithAttachments()
    },
    [submitWithAttachments],
  )

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true
  }, [])

  const handleCompositionEnd = useCallback(() => {
    composingRef.current = false
  }, [])

  const isHero = variant === 'hero'

  return (
    <div
      className={
        isHero
          ? 'mx-auto max-w-3xl w-full px-4 mb-8'
          : 'px-6 py-6 max-w-[var(--chat-max-width)] mx-auto w-full'
      }
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <form onSubmit={handleSubmit}>
        <div
          className={`relative group transition-all duration-300 ${
            isHero ? 'glass-panel rounded-2xl' : 'bg-[var(--color-surface)] rounded-xl border border-[var(--color-border-light)] p-1.5'
          } ${isDragOver ? 'ring-2 ring-[var(--color-accent)]' : ''}`}
        >
          {/* Drag-over overlay */}
          {isDragOver && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--color-surface)]/80 backdrop-blur-[1px] rounded-[inherit] pointer-events-none">
              <div className="bg-[var(--color-accent)]/10 border-2 border-dashed border-[var(--color-accent)] rounded-2xl px-8 py-4">
                <p className="text-sm font-semibold text-[var(--color-accent)]">
                  Drop file to reference
                </p>
              </div>
            </div>
          )}

          {/* File attachment chips */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pt-3 pb-1">
              {attachments.map((att, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--color-accent-muted)] border border-[var(--color-accent)]/20 text-xs group/chip"
                  title={att.path}
                >
                  <File size={12} className="text-[var(--color-accent)] shrink-0" />
                  <span className="text-[var(--color-text-secondary)] truncate max-w-[160px]">
                    {att.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(idx)}
                    className="p-0.5 rounded hover:bg-[var(--color-accent)]/20 text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              placeholder={attachments.length > 0 ? 'Ask about these files...' : placeholder}
              disabled={disabled || isStreaming}
              rows={1}
              className="flex-1 px-4 py-3 bg-transparent border-none focus:ring-0 resize-none text-sm leading-relaxed min-h-[46px] max-h-[200px] scrollbar-subtle text-[var(--color-text)] placeholder-[var(--color-text-quaternary)]"
            />

            <div className="flex items-center gap-2 pb-1 pr-1">
              {isStreaming ? (
                <button
                  type="button"
                  onClick={onAbort}
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-[var(--color-error)] text-white hover:bg-[var(--color-error)]/90 active:scale-95 transition-all"
                >
                  <Square size={14} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={(!input.trim() && attachments.length === 0) || disabled}
                  className="w-9 h-9 flex items-center justify-center rounded-lg bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-light)] active:scale-95 disabled:opacity-30 disabled:scale-100 disabled:cursor-not-allowed transition-all"
                >
                  <Send size={16} />
                </button>
              )}
            </div>
          </div>

          {!isHero && (
            <div className="absolute -top-5 left-3">
              <span className="text-[10px] text-[var(--color-text-quaternary)]">
                {attachments.length > 0
                  ? `${attachments.length} file(s) · Shift + Enter for new line`
                  : 'Shift + Enter for new line · Drop files here'}
              </span>
            </div>
          )}
        </div>
      </form>
    </div>
  )
}
