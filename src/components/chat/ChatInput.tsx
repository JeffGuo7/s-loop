import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, Square, X, File, Paperclip, Mic, LoaderCircle, AudioLines, PhoneCall } from 'lucide-react'
import { TextField, TextArea } from "@heroui/react"
import { Button, Card } from '../ui'
import {
  cancelDictation,
  getDictationLevel,
  getDictationStatus,
  isTauriRuntime,
  openVoiceInputSettings,
  startDictation,
  stopDictation,
  type VoiceInputStatus,
} from '../../utils/voiceInput'
import {
  cancelRealtimeVoice,
  getVoiceRuntimeStatus,
  listenRealtimeVoice,
  listenSpeechPlayback,
  startRealtimeVoice,
  stopRealtimeVoice,
  stopSpeaking,
  voiceAsset,
  type VoiceRuntimeStatus,
} from '../../utils/voiceRuntime'
import {
  getVoiceConversation,
  listenVoiceConversation,
  setVoiceConversation,
  setVoiceConversationState,
  shouldInterruptVoicePlayback,
  type VoiceConversationSnapshot,
} from '../../utils/voiceConversation'

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
  const { t, i18n } = useTranslation()
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<FileAttachment[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [dictation, setDictation] = useState<VoiceInputStatus | null>(null)
  const [dictationBusy, setDictationBusy] = useState(false)
  const [dictationError, setDictationError] = useState<string | null>(null)
  const [levels, setLevels] = useState<number[]>([])
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [voiceRuntime, setVoiceRuntime] = useState<VoiceRuntimeStatus | null>(null)
  const [realtimeMode, setRealtimeMode] = useState<'dictation' | 'conversation' | null>(null)
  const [realtimePartial, setRealtimePartial] = useState('')
  const [realtimeLevel, setRealtimeLevel] = useState(0)
  const [realtimeBusy, setRealtimeBusy] = useState(false)
  const [conversation, setConversationSnapshot] = useState<VoiceConversationSnapshot>(
    getVoiceConversation(),
  )
  const composingRef = useRef(false)
  const realtimeModeRef = useRef<'dictation' | 'conversation' | null>(null)
  const turnSubmittedRef = useRef(false)
  const isStreamingRef = useRef(isStreaming)
  const realtimeLevelRef = useRef(0)
  const playbackStartedAtRef = useRef(0)
  const acceptVoiceTurnAfterRef = useRef(0)

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
    if (dictation?.recording || dictationBusy || realtimeMode || realtimeBusy) return
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
  }, [input, attachments, onSubmit, dictation?.recording, dictationBusy, realtimeMode, realtimeBusy])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !composingRef.current) {
        e.preventDefault()
        if ((input.trim() || attachments.length > 0) && !isStreaming && !disabled && !dictation?.recording && !dictationBusy && !realtimeMode && !realtimeBusy) {
          submitWithAttachments()
        }
      }
    },
    [input, attachments, isStreaming, disabled, submitWithAttachments, dictation?.recording, dictationBusy, realtimeMode, realtimeBusy],
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

  useEffect(() => {
    if (!isTauriRuntime()) return
    const refresh = (event?: Event) => {
      const supplied = (event as CustomEvent<VoiceInputStatus> | undefined)?.detail
      if (supplied) {
        setDictation(supplied)
        return
      }
      void getDictationStatus().then(setDictation).catch(() => setDictation(null))
    }
    refresh()
    window.addEventListener('s-loop:voice-input-changed', refresh)
    return () => window.removeEventListener('s-loop:voice-input-changed', refresh)
  }, [])

  useEffect(() => {
    realtimeModeRef.current = realtimeMode
  }, [realtimeMode])

  useEffect(() => {
    isStreamingRef.current = isStreaming
  }, [isStreaming])

  useEffect(() => {
    if (!conversation.active || conversation.state !== 'listening') {
      return
    }
    turnSubmittedRef.current = false
    if (realtimeMode || realtimeBusy || isStreaming) return
    realtimeModeRef.current = 'conversation'
    setRealtimeMode('conversation')
    setRealtimeBusy(true)
    void startRealtimeVoice()
      .then(setVoiceRuntime)
      .catch((reason) => {
        setDictationError(String(reason))
        setVoiceConversation(false, 'error', String(reason))
      })
      .finally(() => setRealtimeBusy(false))
  }, [conversation.active, conversation.state, realtimeMode, realtimeBusy, isStreaming])

  useEffect(() => {
    if (!isTauriRuntime()) return
    void getVoiceRuntimeStatus().then(setVoiceRuntime).catch(() => setVoiceRuntime(null))
    const disposeConversation = listenVoiceConversation(setConversationSnapshot)
    let disposeRealtime: (() => void) | undefined
    let disposePlayback: (() => void) | undefined

    void listenRealtimeVoice((event) => {
      if (event.kind === 'level') {
        const level = event.level ?? 0
        realtimeLevelRef.current = level
        setRealtimeLevel(level)
        return
      }
      if (event.kind === 'speech-start') {
        const current = getVoiceConversation()
        if (shouldInterruptVoicePlayback(
          realtimeModeRef.current,
          current,
          playbackStartedAtRef.current,
          realtimeLevelRef.current,
        )) {
          turnSubmittedRef.current = false
          acceptVoiceTurnAfterRef.current = 0
          setVoiceConversationState('listening')
          void stopSpeaking().catch((reason) => setDictationError(String(reason)))
        }
        return
      }
      if (event.kind === 'partial') {
        const current = getVoiceConversation()
        if (
          realtimeModeRef.current !== 'conversation' ||
          current.state === 'listening'
        ) {
          setRealtimePartial(event.text?.trim() ?? '')
        }
        return
      }
      if (event.kind === 'final') {
        const transcript = event.text?.trim() ?? ''
        setRealtimePartial('')
        if (!transcript) return

        const currentConversation = getVoiceConversation()
        if (
          realtimeModeRef.current === 'conversation' &&
          currentConversation.active &&
          event.turnComplete &&
          !turnSubmittedRef.current &&
          Date.now() >= acceptVoiceTurnAfterRef.current &&
          !isStreamingRef.current
        ) {
          turnSubmittedRef.current = true
          setVoiceConversationState('thinking')
          onSubmit(transcript)
          return
        }

        if (realtimeModeRef.current === 'dictation') {
          setInput((draft) =>
            draft.trim() ? `${draft.trimEnd()} ${transcript}` : transcript,
          )
        }
        return
      }
      if (event.kind === 'state') {
        if (event.state === 'listening') {
          setRealtimeBusy(false)
          if (getVoiceConversation().active) {
            setVoiceConversationState('listening')
          }
        }
        if (event.state === 'stopped') {
          setRealtimeBusy(false)
          setRealtimeLevel(0)
          setRealtimePartial('')
          if (!getVoiceConversation().active) {
            realtimeModeRef.current = null
            setRealtimeMode(null)
          }
        }
        return
      }
      if (event.kind === 'error') {
        setDictationError(event.message || 'Real-time voice recognition failed.')
        setRealtimeBusy(false)
        realtimeModeRef.current = null
        setRealtimeMode(null)
        setVoiceConversation(false, 'error', event.message || undefined)
      }
    }).then((dispose) => {
      disposeRealtime = dispose
    })

    void listenSpeechPlayback((event) => {
      const current = getVoiceConversation()
      if (!current.active) return
      if (event.state === 'loading' || event.state === 'speaking') {
        if (current.state !== 'speaking') {
          playbackStartedAtRef.current = Date.now()
        }
        setVoiceConversationState('speaking')
        return
      }
      if (event.state === 'error') {
        setVoiceConversation(false, 'error', event.message || undefined)
        setDictationError(event.message || 'Local speech playback failed.')
        return
      }
      if (event.state === 'idle' && current.state === 'speaking') {
        playbackStartedAtRef.current = 0
        acceptVoiceTurnAfterRef.current = Date.now() + 300
        turnSubmittedRef.current = false
        setVoiceConversationState('listening')
      }
    }).then((dispose) => {
      disposePlayback = dispose
    })

    return () => {
      disposeConversation()
      disposeRealtime?.()
      disposePlayback?.()
    }
  }, [onSubmit])

  useEffect(() => {
    if (!dictation?.recording) {
      setLevels([])
      setRecordingSeconds(0)
      return
    }
    const started = Date.now()
    const timer = window.setInterval(() => {
      setRecordingSeconds(Math.floor((Date.now() - started) / 1000))
      void getDictationLevel()
        .then((level) => setLevels((current) => [...current.slice(-15), level]))
        .catch(() => undefined)
    }, 100)
    return () => window.clearInterval(timer)
  }, [dictation?.recording])

  useEffect(() => {
    if (!dictation?.recording) return
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      void cancelDictation()
        .catch(() => undefined)
        .finally(() => void getDictationStatus().then(setDictation))
    }
    window.addEventListener('keydown', cancelOnEscape)
    return () => window.removeEventListener('keydown', cancelOnEscape)
  }, [dictation?.recording])

  useEffect(() => {
    if (!realtimeMode) return
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setVoiceConversation(false)
      realtimeModeRef.current = null
      setRealtimeMode(null)
      setRealtimePartial('')
      setRealtimeLevel(0)
      void cancelRealtimeVoice().then(setVoiceRuntime).catch(() => undefined)
      void stopSpeaking().catch(() => undefined)
    }
    window.addEventListener('keydown', cancelOnEscape)
    return () => window.removeEventListener('keydown', cancelOnEscape)
  }, [realtimeMode])

  const toggleDictation = async () => {
    if (!isTauriRuntime() || dictationBusy) return
    setDictationError(null)
    try {
      if (dictation?.recording) {
        setDictationBusy(true)
        const transcript = (await stopDictation()).trim()
        if (transcript) {
          setInput((draft) => draft.trim() ? `${draft.trimEnd()} ${transcript}` : transcript)
        }
        setDictation(await getDictationStatus())
        textareaRef.current?.focus()
        return
      }
      const current = dictation || await getDictationStatus()
      if (!current.supported || !current.modelVerified || !current.testPassed) {
        openVoiceInputSettings()
        return
      }
      setDictationBusy(true)
      setDictation(await startDictation())
    } catch (reason) {
      setDictationError(String(reason))
      await getDictationStatus().then(setDictation).catch(() => undefined)
    } finally {
      setDictationBusy(false)
    }
  }

  const realtimeReady =
    !!voiceAsset(voiceRuntime, 'streaming-asr')?.installed &&
    !!voiceAsset(voiceRuntime, 'vad')?.installed
  const conversationReady =
    realtimeReady && !!voiceAsset(voiceRuntime, 'tts')?.installed

  const toggleRealtimeDictation = async () => {
    if (!isTauriRuntime() || realtimeBusy || conversation.active) return
    setDictationError(null)
    setRealtimeBusy(true)
    try {
      if (realtimeMode === 'dictation') {
        await stopRealtimeVoice()
        realtimeModeRef.current = null
        setRealtimeMode(null)
        setRealtimePartial('')
        setRealtimeLevel(0)
        setVoiceRuntime(await getVoiceRuntimeStatus())
        textareaRef.current?.focus()
        return
      }
      const current = voiceRuntime || await getVoiceRuntimeStatus()
      setVoiceRuntime(current)
      if (
        !voiceAsset(current, 'streaming-asr')?.installed ||
        !voiceAsset(current, 'vad')?.installed
      ) {
        openVoiceInputSettings()
        return
      }
      turnSubmittedRef.current = false
      realtimeModeRef.current = 'dictation'
      setRealtimeMode('dictation')
      setVoiceRuntime(await startRealtimeVoice())
    } catch (reason) {
      realtimeModeRef.current = null
      setRealtimeMode(null)
      setDictationError(String(reason))
    } finally {
      setRealtimeBusy(false)
    }
  }

  const toggleConversation = async () => {
    if (!isTauriRuntime() || realtimeBusy) return
    setDictationError(null)

    if (conversation.active) {
      if (conversation.state === 'speaking') {
        await stopSpeaking().catch((reason) => setDictationError(String(reason)))
        return
      }
      setVoiceConversation(false)
      realtimeModeRef.current = null
      setRealtimeMode(null)
      setRealtimePartial('')
      setRealtimeLevel(0)
      await Promise.all([
        cancelRealtimeVoice().catch(() => undefined),
        stopSpeaking().catch(() => undefined),
      ])
      setVoiceRuntime(await getVoiceRuntimeStatus().catch(() => voiceRuntime))
      return
    }

    const current = voiceRuntime || await getVoiceRuntimeStatus()
    setVoiceRuntime(current)
    if (
      !voiceAsset(current, 'streaming-asr')?.installed ||
      !voiceAsset(current, 'vad')?.installed ||
      !voiceAsset(current, 'tts')?.installed
    ) {
      openVoiceInputSettings()
      return
    }

    setRealtimeBusy(true)
    setVoiceConversation(true, 'starting')
    turnSubmittedRef.current = false
    realtimeModeRef.current = 'conversation'
    setRealtimeMode('conversation')
    try {
      setVoiceRuntime(await startRealtimeVoice())
    } catch (reason) {
      realtimeModeRef.current = null
      setRealtimeMode(null)
      setVoiceConversation(false, 'error', String(reason))
      setDictationError(String(reason))
    } finally {
      setRealtimeBusy(false)
    }
  }

  // Auto-resize logic
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 400)}px`
    }
  }, [input])

  const isHero = variant === 'hero'
  const voiceReady = !!dictation?.supported && !!dictation?.modelVerified && !!dictation?.testPassed
  const recordingTime = `${Math.floor(recordingSeconds / 60)}:${String(recordingSeconds % 60).padStart(2, '0')}`
  const chinese = i18n.resolvedLanguage?.startsWith('zh')

  return (
    <div
      className="w-full max-w-(--spacing-chat-max) mx-auto px-4 pb-2"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {dictationError && (
        <div role="alert" className="mb-2 rounded-xl bg-red-500/10 px-4 py-2 text-sm text-red-500">
          {dictationError}
        </div>
      )}
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

            {dictation?.recording && (
              <div className="mx-5 mt-4 flex items-center gap-3 rounded-2xl bg-red-500/5 px-4 py-3 text-red-500">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs font-bold">{chinese ? '正在聆听' : 'Listening'} · {recordingTime}</span>
                <div className="ml-auto flex h-7 items-center gap-1" aria-label="Microphone input level">
                  {Array.from({ length: 16 }, (_, index) => {
                    const level = levels[levels.length - 16 + index] ?? 0
                    return <span key={index} className="w-1 rounded-full bg-red-500/70" style={{ height: `${4 + level * 22}px` }} />
                  })}
                </div>
                <span className="text-[11px] text-text-tertiary">Esc {chinese ? '取消' : 'to cancel'}</span>
              </div>
            )}

            {realtimeMode && (
              <div className="mx-5 mt-4 rounded-2xl bg-accent/5 px-4 py-3 text-accent">
                <div className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-accent animate-pulse" />
                  <span className="text-xs font-bold">
                    {realtimeMode === 'conversation'
                      ? chinese
                        ? conversation.state === 'thinking'
                          ? '正在思考'
                          : conversation.state === 'speaking'
                            ? '正在回答'
                            : '实时通话 · 正在聆听'
                        : conversation.state === 'thinking'
                          ? 'Thinking'
                          : conversation.state === 'speaking'
                            ? 'Speaking'
                            : 'Voice call · Listening'
                      : chinese
                        ? '实时字幕'
                        : 'Live captions'}
                  </span>
                  <div className="ml-auto flex h-7 items-center gap-1" aria-label="Real-time microphone input level">
                    {Array.from({ length: 16 }, (_, index) => (
                      <span
                        key={index}
                        className="w-1 rounded-full bg-accent/70 transition-all"
                        style={{
                          height: `${4 + Math.max(0.04, realtimeLevel) * (10 + (index % 5) * 3)}px`,
                        }}
                      />
                    ))}
                  </div>
                  <span className="text-[11px] text-text-tertiary">
                    Esc {chinese ? '结束' : 'to stop'}
                  </span>
                </div>
                {realtimePartial && (
                  <p className="mt-2 border-t border-accent/10 pt-2 text-sm font-medium text-text-secondary">
                    {realtimePartial}
                    <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-accent align-middle" />
                  </p>
                )}
              </div>
            )}

            <div className="flex items-end px-3">
            <div className="flex-1">
              <TextField
                value={input}
                onChange={setInput}
                isDisabled={disabled || isStreaming || !!dictation?.recording || dictationBusy || !!realtimeMode || realtimeBusy}
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
                  <div className="flex items-center gap-2">
                    {isTauriRuntime() && (
                      <>
                        <Button
                          type="button"
                          variant={dictation?.recording ? 'danger' : 'secondary'}
                          size="icon"
                          aria-label={dictation?.recording ? 'Stop dictation' : voiceReady ? 'Start dictation' : 'Configure voice input'}
                          title={dictation?.recording ? (chinese ? '停止并转写' : 'Stop and transcribe') : voiceReady ? (chinese ? '本地语音输入' : 'Local voice input') : (chinese ? '先配置语音输入' : 'Configure voice input first')}
                          isDisabled={dictationBusy || disabled || isStreaming || !!realtimeMode || realtimeBusy}
                          onClick={() => void toggleDictation()}
                          className={`w-11 h-11 rounded-xl ${!voiceReady && !dictation?.recording ? 'opacity-50' : ''}`}
                        >
                          {dictationBusy ? <LoaderCircle size={17} className="animate-spin" /> : dictation?.recording ? <Square size={15} fill="currentColor" /> : <Mic size={18} />}
                        </Button>
                        <Button
                          type="button"
                          variant={realtimeMode === 'dictation' ? 'danger' : 'secondary'}
                          size="icon"
                          aria-label={realtimeMode === 'dictation' ? 'Stop live captions' : 'Start live captions'}
                          title={
                            realtimeMode === 'dictation'
                              ? chinese ? '停止实时字幕' : 'Stop live captions'
                              : realtimeReady
                                ? chinese ? '流式中间字幕' : 'Live partial captions'
                                : chinese ? '先安装实时语音模型' : 'Configure real-time voice first'
                          }
                          isDisabled={disabled || isStreaming || dictationBusy || !!dictation?.recording || realtimeBusy || conversation.active}
                          onClick={() => void toggleRealtimeDictation()}
                          className={`w-11 h-11 rounded-xl ${!realtimeReady && realtimeMode !== 'dictation' ? 'opacity-50' : ''}`}
                        >
                          {realtimeBusy && realtimeMode !== 'conversation' ? (
                            <LoaderCircle size={17} className="animate-spin" />
                          ) : realtimeMode === 'dictation' ? (
                            <Square size={15} fill="currentColor" />
                          ) : (
                            <AudioLines size={18} />
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant={conversation.active ? 'danger' : 'secondary'}
                          size="icon"
                          aria-label={conversation.active ? 'Stop voice conversation' : 'Start voice conversation'}
                          title={
                            conversation.active && conversation.state === 'speaking'
                              ? chinese ? '打断回答并继续说话' : 'Interrupt and speak'
                              : conversation.active
                                ? chinese ? '结束实时通话' : 'End voice conversation'
                                : conversationReady
                                  ? chinese ? '开始实时语音通话' : 'Start voice conversation'
                                  : chinese ? '先安装实时识别、VAD 和 TTS 模型' : 'Install real-time voice and TTS models first'
                          }
                          isDisabled={disabled || !!dictation?.recording || dictationBusy || (isStreaming && !conversation.active) || (realtimeMode === 'dictation')}
                          onClick={() => void toggleConversation()}
                          className={`w-11 h-11 rounded-xl ${!conversationReady && !conversation.active ? 'opacity-50' : ''}`}
                        >
                          {realtimeBusy && realtimeMode === 'conversation' ? (
                            <LoaderCircle size={17} className="animate-spin" />
                          ) : conversation.active && conversation.state !== 'speaking' ? (
                            <Square size={15} fill="currentColor" />
                          ) : (
                            <PhoneCall size={18} />
                          )}
                        </Button>
                      </>
                    )}
                    <Button
                      type="submit"
                      variant="primary"
                      size="icon"
                      aria-label="Send message"
                      isDisabled={(!input.trim() && attachments.length === 0) || disabled || !!dictation?.recording || dictationBusy || !!realtimeMode || realtimeBusy}
                      className={`w-11 h-11 rounded-xl shadow-xl transition-all duration-700 ${
                        (input.trim() || attachments.length > 0) && !dictation?.recording && !dictationBusy && !realtimeMode && !realtimeBusy
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
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      </form>
    </div>
  )
}
