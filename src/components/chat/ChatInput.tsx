import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, Square, X, File, Paperclip } from 'lucide-react'
import { TextField, TextArea } from "@heroui/react"
import { Button, Card } from '../ui'

interface FileAttachment {
  path: string
  name: string
  data?: string       // base64 for images
  mimeType?: string   // MIME type for images
}

export interface ImageAttachment {
  data: string
  mimeType: string
}

interface ChatInputProps {
  onSubmit: (content: string, images?: ImageAttachment[]) => void
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
    setAttachments((prev) => {
      const removed = prev[index]
      // Revoke object URLs for pasted images to avoid memory leaks
      if (removed?.path?.startsWith('blob:')) {
        URL.revokeObjectURL(removed.path)
      }
      return prev.filter((_, i) => i !== index)
    })
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
        // Skip .zip files — they're handled by SkillDropZone
        if (file.name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') continue
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
    const images: ImageAttachment[] = []

    // File references — rendered as styled chips via Markdown
    for (const att of attachments) {
      // Images with base64 data are sent as multimodal content
      if (att.data && att.mimeType?.startsWith('image/')) {
        images.push({ data: att.data, mimeType: att.mimeType })
      }
      parts.push(`[File: ${att.name}](${att.path || '#'})`)
    }

    const userText = input.trim()
    if (userText) parts.push(userText)

    // Revoke all blob URLs before submitting
    for (const att of attachments) {
      if (att.path?.startsWith('blob:')) {
        URL.revokeObjectURL(att.path)
      }
    }

    onSubmit(parts.join('\n'), images.length > 0 ? images : undefined)
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

  // ── Paste support (images / screenshots from clipboard) ──
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return

    const newAttachments: FileAttachment[] = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          const ext = item.type.split('/')[1] || 'png'
          const name = file.name || `paste-${Date.now()}.${ext}`
          const mimeType = item.type
          // Create a local object URL for preview (will be revoked on submit)
          const localUrl = URL.createObjectURL(file)
          // Read blob to base64 for submission
          const buffer = await file.arrayBuffer()
          const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))
          newAttachments.push({ path: localUrl, name, data: base64, mimeType })
        }
      }
    }

    if (newAttachments.length > 0) {
      e.preventDefault()
      setAttachments((prev) => [...prev, ...newAttachments])
    }
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
                  onPaste={handlePaste}
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
                    aria-label="Stop generating"
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
                    aria-label="Send message"
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
          </div>
        </Card>
      </form>
    </div>
  )
}
