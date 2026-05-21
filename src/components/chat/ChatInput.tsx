import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Square, X, File, Paperclip } from 'lucide-react'
import { TextField, TextArea } from "@heroui/react"
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
  const composingRef = useRef(false)

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

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize logic
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 400)}px`
    }
  }, [input])

  const isHero = variant === 'hero'

  return (
    <div
      className="w-full max-w-[1000px] mx-auto px-12 pb-20"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <form onSubmit={handleSubmit}>
        <Card
          variant={isHero ? 'glass' : 'default'}
          className={`relative group p-4 transition-all duration-700 border border-border-light ${
            isHero ? 'shadow-[0_48px_128px_rgba(0,0,0,0.15)]' : 'shadow-3xl hover:shadow-accent/10'
          } ${isDragOver ? 'ring-2 ring-accent ring-offset-[12px] ring-offset-bg' : ''} rounded-[48px] bg-surface/90 backdrop-blur-3xl`}
        >
          {isDragOver && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-surface/95 backdrop-blur-2xl pointer-events-none">
              <div className="rounded-[32px] border-2 border-dashed border-accent/40 bg-accent-subtle px-16 py-10 animate-fade-in-scale">
                <p className="text-lg font-bold text-accent flex items-center gap-4">
                  <Paperclip size={26} />
                  Drop file to reference
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-5 px-10 pt-8 pb-4 animate-fade-in">
                {attachments.map((att, idx) => (
                  <div
                    key={idx}
                    className="group/att inline-flex items-center gap-5 rounded-[22px] border border-border-light bg-surface-secondary/60 pl-6 pr-5 py-4 text-[14px] transition-all hover:border-accent/50 hover:bg-surface-secondary shadow-sm"
                    title={att.path}
                  >
                    <File size={18} className="text-accent" />
                    <span className="max-w-[240px] truncate text-text-secondary font-bold tracking-tight">{att.name}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(idx)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary hover:bg-red-500/10 hover:text-red-500 transition-all opacity-40 group-hover/att:opacity-100"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-end px-4">
              <div className="flex-1">
                <TextField
                  value={input}
                  onChange={setInput}
                  isDisabled={disabled || isStreaming}
                  className="w-full"
                >
                  <TextArea
                    ref={textareaRef}
                    onKeyDown={handleKeyDown}
                    onCompositionStart={handleCompositionStart}
                    onCompositionEnd={handleCompositionEnd}
                    placeholder={attachments.length > 0 ? 'Ask about these files...' : placeholder}
                    className="w-full bg-transparent hover:bg-transparent focus:outline-none shadow-none border-none p-10 min-h-[100px] text-[19px] font-bold leading-relaxed custom-scrollbar text-text placeholder:text-text-quaternary/30 resize-none tracking-tight"
                    rows={1}
                  />
                </TextField>
              </div>

              <div className="flex items-center p-6">
                {isStreaming ? (
                  <Button
                    type="button"
                    variant="danger"
                    size="icon"
                    onClick={onAbort}
                    className="w-16 h-16 rounded-[24px] shadow-3xl shadow-red-500/30 animate-fade-in"
                  >
                    <Square size={24} fill="currentColor" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    variant="primary"
                    size="icon"
                    isDisabled={(!input.trim() && attachments.length === 0) || disabled}
                    className={`w-16 h-16 rounded-[24px] shadow-3xl transition-all duration-700 ${
                      input.trim() || attachments.length > 0 
                        ? 'shadow-accent/50 scale-100 hover:scale-110 active:scale-95' 
                        : 'shadow-none scale-90 opacity-20 grayscale pointer-events-none'
                    }`}
                  >
                    <Send
                      size={28}
                      strokeWidth={3}
                      className={input.trim() || attachments.length > 0 ? 'translate-x-0.5 -translate-y-0.5' : ''}
                    />
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between px-14 pb-10 pt-4 text-[12px] font-bold tracking-[0.4em] uppercase transition-all duration-300">
              <div className={`flex items-center gap-8 transition-opacity ${isHero ? 'opacity-60' : 'opacity-40 group-focus-within:opacity-90'}`}>
                <div className="flex items-center gap-4">
                  <div className={`w-2.5 h-2.5 rounded-full ${input.trim() || attachments.length > 0 ? 'bg-accent shadow-[0_0_12px_var(--color-accent)]' : 'bg-text-quaternary opacity-40'}`} />
                  <span className="tracking-widest">
                    {attachments.length > 0
                      ? `${attachments.length} file reference${attachments.length > 1 ? 's' : ''}`
                      : 'Shift + Enter for new line'}
                  </span>
                </div>
                <div className="w-2 h-2 rounded-full bg-border-light" />
                <span className="hidden sm:inline tracking-widest">Enter to send</span>
              </div>
              <div className={`transition-opacity flex items-center gap-4 ${isHero ? 'opacity-60' : 'opacity-40 group-focus-within:opacity-90'}`}>
                <span className="w-2 h-2 rounded-full bg-border-light" />
                <span className="tracking-widest">Snotra Intelligence</span>
              </div>
            </div>
          </div>
        </Card>
      </form>
    </div>
  )
}

