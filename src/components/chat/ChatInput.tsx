import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Square, X, File, Paperclip } from 'lucide-react'
import { Button, Card } from '../ui'

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
          : 'mx-auto w-full max-w-(--chat-max-width) px-8 pb-10'
      }
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <form onSubmit={handleSubmit}>
        <Card
          variant={isHero ? 'glass' : 'default'}
          className={`relative group p-1 transition-all duration-500 border border-(--color-border-light) ${
            isHero ? 'shadow-2xl' : 'shadow-lg hover:shadow-xl'
          } ${isDragOver ? 'ring-2 ring-(--color-accent) ring-offset-4 ring-offset-(--color-bg)' : ''}`}
        >
          {isDragOver && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-(--color-surface)/80 backdrop-blur-md pointer-events-none">
              <div className="rounded-2xl border-2 border-dashed border-(--color-accent)/40 bg-(--color-accent-subtle) px-10 py-6 animate-fade-in-scale">
                <p className="text-sm font-bold text-(--color-accent) flex items-center gap-2">
                  <Paperclip size={18} />
                  Drop file to reference
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2.5 px-4 pt-4 pb-2 animate-fade-in">
                {attachments.map((att, idx) => (
                  <div
                    key={idx}
                    className="group/att inline-flex items-center gap-2.5 rounded-xl border border-(--color-border-light) bg-(--color-surface-secondary)/50 pl-3 pr-2 py-2 text-xs transition-all hover:border-(--color-accent)/30 hover:bg-(--color-surface-secondary)"
                    title={att.path}
                  >
                    <File size={13} className="text-(--color-accent)" />
                    <span className="max-w-[160px] truncate text-(--color-text-secondary) font-bold">{att.name}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(idx)}
                      className="inline-flex h-5 w-5 items-center justify-center rounded-lg text-(--color-text-tertiary) hover:bg-(--color-error-bg)/50 hover:text-(--color-error) transition-all opacity-50 group-hover/att:opacity-100"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2 px-2">
              <div className="flex-1 px-4">
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
                  className="w-full resize-none border-none bg-transparent py-5 text-[15px] font-medium leading-relaxed min-h-[64px] max-h-[450px] custom-scrollbar text-(--color-text) placeholder-(--color-text-quaternary)/50 focus:outline-none focus:ring-0"
                />
              </div>

              <div className="flex items-center gap-2 p-2.5">
                {isStreaming ? (
                  <Button
                    type="button"
                    variant="danger"
                    size="icon"
                    onClick={onAbort}
                    className="w-11 h-11 rounded-xl shadow-lg shadow-error/10 animate-fade-in"
                  >
                    <Square size={16} fill="currentColor" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    variant="primary"
                    size="icon"
                    isDisabled={(!input.trim() && attachments.length === 0) || disabled}
                    className={`w-11 h-11 rounded-xl shadow-lg transition-all duration-500 ${
                      input.trim() || attachments.length > 0 
                        ? 'shadow-accent/30 scale-100' 
                        : 'shadow-none scale-95 opacity-30 grayscale'
                    }`}
                  >
                    <Send
                      size={18}
                      strokeWidth={2.5}
                      className={input.trim() || attachments.length > 0 ? 'translate-x-0.5 -translate-y-0.5' : ''}
                    />
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between px-6 pb-4 pt-1 text-[10px] font-bold tracking-[0.1em] uppercase transition-all duration-300">
              <div className={`flex items-center gap-4 transition-opacity ${isHero ? 'opacity-40' : 'opacity-30 group-focus-within:opacity-60'}`}>
                <div className="flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-(--color-accent)" />
                  <span>
                    {attachments.length > 0
                      ? `${attachments.length} file reference${attachments.length > 1 ? 's' : ''}`
                      : 'Shift + Enter for new line'}
                  </span>
                </div>
                <div className="w-1 h-1 rounded-full bg-(--color-text-tertiary)/30" />
                <span className="hidden sm:inline">Enter to send</span>
              </div>
              <div className={`transition-opacity flex items-center gap-1.5 ${isHero ? 'opacity-40' : 'opacity-30 group-focus-within:opacity-60'}`}>
                <span className="w-1 h-1 rounded-full bg-(--color-text-tertiary)/30" />
                Snotra AI
              </div>
            </div>
          </div>
        </Card>
      </form>
    </div>
  )
}

