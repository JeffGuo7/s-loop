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
          ? 'mx-auto max-w-4xl w-full px-6'
          : 'mx-auto w-full max-w-(--chat-max-width) px-8 pb-8'
      }
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <form onSubmit={handleSubmit}>
        <div
          className={`relative group transition-all duration-300 ${
            isHero
              ? 'surface-panel px-3 py-3 shadow-lg'
              : 'surface-panel px-3 py-3 bg-(--color-surface-elevated)'
          } ${isDragOver ? 'ring-2 ring-(--color-accent) ring-offset-2 ring-offset-(--color-bg)' : ''}`}
        >
          {isDragOver && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-(--color-surface)/80 backdrop-blur-sm pointer-events-none">
              <div className="rounded-md border border-dashed border-(--color-accent) bg-(--color-accent-muted) px-8 py-4">
                <p className="text-sm font-semibold text-(--color-accent)">Drop file to reference</p>
              </div>
            </div>
          )}

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-2 pb-3">
              {attachments.map((att, idx) => (
                <div
                  key={idx}
                  className="inline-flex items-center gap-2 rounded-full border border-(--color-border) bg-(--color-surface-secondary) px-3 py-2 text-xs"
                  title={att.path}
                >
                  <File size={12} className="text-(--color-accent) shrink-0" />
                  <span className="max-w-[180px] truncate text-(--color-text-secondary)">{att.name}</span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(idx)}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full text-(--color-text-tertiary) hover:bg-(--color-surface) hover:text-(--color-text) transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-3">
            <div className="flex-1 rounded-md bg-(--color-surface-secondary) border border-(--color-border-light) px-3">
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
                className="w-full resize-none border-none bg-transparent px-1 py-4 text-[15px] leading-relaxed min-h-[56px] max-h-[300px] custom-scrollbar text-(--color-text) placeholder-(--color-text-quaternary) focus:outline-none focus:ring-0"
              />
            </div>

            <div className="flex items-center gap-2 pb-0.5">
              {isStreaming ? (
                <button
                  type="button"
                  onClick={onAbort}
                  className="w-12 h-12 flex items-center justify-center rounded-md bg-(--color-error) text-white hover:opacity-90 transition-all shadow-md"
                >
                  <Square size={15} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={(!input.trim() && attachments.length === 0) || disabled}
                  className="w-12 h-12 flex items-center justify-center rounded-md bg-(--color-accent) text-white hover:bg-(--color-accent-light) active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-md shadow-(--color-accent)/20"
                >
                  <Send
                    size={18}
                    strokeWidth={2.5}
                    className={input.trim() || attachments.length > 0 ? 'translate-x-px -translate-y-px' : ''}
                  />
                </button>
              )}
            </div>
          </div>

          <div className={`flex items-center justify-between px-2 pt-3 text-[11px] text-(--color-text-tertiary) transition-opacity ${isHero ? 'opacity-70' : 'opacity-60 group-focus-within:opacity-100'}`}>
            <span>
              {attachments.length > 0
                ? `${attachments.length} file reference${attachments.length > 1 ? 's' : ''} attached`
                : 'Shift + Enter for new line'}
            </span>
            <span className="hidden sm:inline">Enter to send</span>
          </div>
        </div>
      </form>
    </div>
  )
}
