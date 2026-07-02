import { useState, useCallback } from 'react'
import { Target, Send, Paperclip, X } from 'lucide-react'

interface FileAttachment {
  path: string
  name: string
}

interface GoalInputProps {
  onSubmit: (goal: string) => void
  loading?: boolean
}

export function GoalInput({ onSubmit, loading }: GoalInputProps) {
  const [goal, setGoal] = useState('')
  const [attachments, setAttachments] = useState<FileAttachment[]>([])
  const [isDragOver, setIsDragOver] = useState(false)

  const removeAttachment = (path: string) => {
    setAttachments(prev => prev.filter(a => a.path !== path))
  }

  const handleSubmit = () => {
    const trimmed = goal.trim()
    if ((!trimmed && attachments.length === 0) || loading) return

    let finalGoal = trimmed
    if (attachments.length > 0) {
      const refs = attachments.map(a => `[File: ${a.name}](${a.path})`).join(', ')
      finalGoal = trimmed
        ? `${trimmed}\n\nAttachments: ${refs}`
        : `Analyze the following files:\n${refs}`
    }

    onSubmit(finalGoal)
    setGoal('')
    setAttachments([])
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const newAttachments: FileAttachment[] = []

    const fileData = e.dataTransfer.getData('application/x-s-loop-file')
    if (fileData) {
      try {
        const { path, name } = JSON.parse(fileData)
        newAttachments.push({ path, name })
      } catch { /* ignore */ }
    } else {
      const files = Array.from(e.dataTransfer.files)
      for (const file of files) {
        newAttachments.push({ path: file.name, name: file.name })
      }
    }

    if (newAttachments.length > 0) {
      setAttachments(prev => {
        const existing = new Set(prev.map(a => a.path))
        return [...prev, ...newAttachments.filter(a => !existing.has(a.path))]
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

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`relative w-full max-w-[560px] rounded-[28px] border bg-white/76 p-6 shadow-sm backdrop-blur-xl dark:bg-white/5 transition-all ${
          isDragOver ? 'border-accent ring-2 ring-accent/20 shadow-accent/10' : 'border-border-light/70'
        }`}
      >
        {/* Drag overlay */}
        {isDragOver && (
          <div className="absolute inset-0 rounded-[28px] bg-accent/5 flex items-center justify-center z-10 pointer-events-none">
            <div className="flex flex-col items-center gap-2">
              <Paperclip size={24} className="text-accent" />
              <span className="text-[12px] font-black text-accent">Drop files or folders</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-accent/10 flex items-center justify-center">
            <Target size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="text-[16px] font-black tracking-tight text-text">New Goal</h2>
            <p className="text-[11px] text-text-tertiary">Describe what you want to achieve — drag files or folders here</p>
          </div>
        </div>

        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="e.g. Research React 19 new features and write a summary report"
          rows={4}
          className="w-full resize-none rounded-2xl border border-border-light bg-surface-secondary/55 px-4 py-3 text-[13px] text-text placeholder:text-text-quaternary outline-none transition-all focus:border-accent/30"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
        />

        {/* File attachments */}
        {attachments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {attachments.map((att) => (
              <span
                key={att.path}
                className="inline-flex items-center gap-1 rounded-lg bg-accent/5 border border-accent/15 px-2 py-1 text-[10px] font-medium text-accent"
              >
                <Paperclip size={9} />
                <span className="max-w-[160px] truncate">{att.name}</span>
                <button
                  onClick={() => removeAttachment(att.path)}
                  className="ml-0.5 p-0.5 rounded hover:bg-accent/10"
                >
                  <X size={9} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mt-4">
          <p className="text-[10px] text-text-quaternary">
            Drag files or folders onto this card to attach them
          </p>
          <button
            onClick={handleSubmit}
            disabled={(!goal.trim() && attachments.length === 0) || loading}
            className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-[11px] font-black text-white shadow-lg shadow-accent/10 transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send size={12} />
            Start Goal
          </button>
        </div>
      </div>
    </div>
  )
}
