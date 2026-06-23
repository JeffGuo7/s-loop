import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
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
  placeholder,
  variant = 'default',
}: ChatInputProps) {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<FileAttachment[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const composingRef = useRef(false)

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }, [])

  // File attachments are now added via drag-and-drop only
  // (clicking files opens the preview panel instead)

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const newAttachments: FileAttachment[] = []

    // Internal file drag (from FileTree) — path is in dataTransfer
    const fileData = e.dataTransfer.getData('application/x-s-loop-file')
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
      className="w-full max-w-(--spacing-chat-max) mx-auto px-4 pb-2"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <form onSubmit={handleSubmit}>
        <Card
          variant={isHero ? 'glass' : 'default'}
          className={`relative group p-2 transition-all duration-700 border border-border-light ${
            isHero ? 'shadow-[0_24px_64px_rgba(0,0,0,0.1)]' : 'shadow-2xl hover:shadow-accent/5'
          } ${isDragOver ? 'ring-2 ring-accent ring-offset-[8px] ring-offset-bg' : 'focus-ring-accent'} rounded-[24px] bg-surface/90 backdrop-blur-3xl`}
        >
          {isDragOver && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-surface/95 backdrop-blur-2xl pointer-events-none">
              <div className="rounded-[20px] border-2 border-dashed border-accent/40 bg-accent-subtle px-10 py-6 animate-fade-in-scale">
                <p className="text-base font-bold text-accent flex items-center gap-3">
                  <Paperclip size={20} />
                  {t('chat.input.dropOverlay')}
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col">
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-3 px-6 pt-5 pb-2 animate-fade-in">
                {attachments.map((att, idx) => (
                  <div
                    key={idx}
                    className="group/att inline-flex items-center gap-3 rounded-[16px] border border-border-light bg-surface-secondary/60 pl-4 pr-3 py-2.5 text-[12px] transition-all hover:border-accent/50 hover:bg-surface-secondary shadow-sm"
                    title={att.path}
                  >
                    <File size={14} className="text-accent" />
                    <span className="max-w-[180px] truncate text-text-secondary font-bold tracking-tight">{att.name}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(idx)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary hover:bg-red-500/10 hover:text-red-500 transition-all opacity-40 group-hover/att:opacity-100"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-end px-3">
            <div className="flex-1">
              <TextField
                value={input}
                onChange={setInput}
                isDisabled={disabled || isStreaming}
                className="w-full selection:bg-accent/20"
              >
                <TextArea
                  ref={textareaRef}
                  onKeyDown={handleKeyDown}
                  onCompositionStart={handleCompositionStart}
                  onCompositionEnd={handleCompositionEnd}
                  placeholder={attachments.length > 0 ? t('chat.input.placeholderWithFiles') : (placeholder || t('chat.input.placeholder'))}
                  className="w-full bg-transparent hover:bg-transparent focus:!ring-0 focus:!outline-none shadow-none border-none p-6 min-h-[60px] text-[15px] font-bold leading-relaxed custom-scrollbar text-text placeholder:text-text-quaternary/30 resize-none tracking-tight selection:bg-accent/20"
                  rows={1}
                />
              </TextField>
            </div>

              <div className="flex items-center p-4">
                {isStreaming ? (
                  <Button
                    type="button"
                    variant="danger"
                    size="icon"
                    onClick={onAbort}
                    className="w-11 h-11 rounded-xl shadow-xl shadow-red-500/30 animate-fade-in"
                  >
                    <Square size={16} fill="currentColor" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    variant="primary"
                    size="icon"
                    isDisabled={(!input.trim() && attachments.length === 0) || disabled}
                    className={`w-11 h-11 rounded-xl shadow-xl transition-all duration-700 ${
                      input.trim() || attachments.length > 0 
                        ? 'shadow-accent/50 scale-100 hover:scale-105 active:scale-95' 
                        : 'shadow-none scale-90 opacity-20 grayscale pointer-events-none'
                    }`}
                  >
                    <Send
                      size={18}
                      strokeWidth={3}
                      className={input.trim() || attachments.length > 0 ? 'translate-x-0.5 -translate-y-0.5' : ''}
                    />
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between px-8 pb-3 pt-1 text-[9px] font-bold tracking-[0.25em] uppercase transition-all duration-300">
              <div className={`flex items-center gap-5 transition-opacity ${isHero ? 'opacity-60' : 'opacity-30 group-focus-within:opacity-80'}`}>
                <div className="flex items-center gap-2.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${input.trim() || attachments.length > 0 ? 'bg-accent shadow-[0_0_6px_var(--color-accent)]' : 'bg-text-quaternary opacity-30'}`} />
                  <span className="tracking-widest">
                    {attachments.length > 0
                      ? t('chat.input.ref', { count: attachments.length })
                      : t('chat.input.shiftEnter')}
                  </span>
                </div>
                <div className="w-1 h-1 rounded-full bg-border-light" />
                <span className="hidden sm:inline tracking-widest">{t('chat.input.enterSend')}</span>
              </div>
              <div className={`transition-opacity flex items-center gap-2.5 ${isHero ? 'opacity-60' : 'opacity-30 group-focus-within:opacity-80'}`}>
                <span className="w-1 h-1 rounded-full bg-border-light" />
                <span className="tracking-widest">{t('chat.input.intelligence')}</span>
              </div>
            </div>
          </div>
        </Card>
      </form>
    </div>
  )
}
