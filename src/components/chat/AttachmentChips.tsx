import { File as FileIcon, X } from 'lucide-react'
export interface FileAttachment {
  path: string
  name: string
  data?: string
  mimeType?: string
}

export function AttachmentChips({
  attachments,
  onRemove,
}: {
  attachments: FileAttachment[]
  onRemove: (index: number) => void
}) {
  if (attachments.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2 px-4 pt-3 pb-1 animate-fade-in">
              <div className="flex flex-wrap gap-2 px-4 pt-3 pb-1 animate-fade-in">
                {attachments.map((att, idx) => (
                  <div
                    key={idx}
                    className="group/att inline-flex items-center gap-2 rounded-lg border border-border bg-surface-secondary/70 pl-3 pr-2 py-2 text-[12px] transition-colors hover:border-accent/50 hover:bg-surface-secondary"
                    title={att.path}
                  >
                    <FileIcon size={14} className="text-accent" />
                    <span className="max-w-[180px] truncate text-text-secondary font-bold tracking-tight">{att.name}</span>
                    <button
                      type="button"
                      onClick={() => onRemove(idx)}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-text-tertiary hover:bg-red-500/10 hover:text-red-500 transition-all opacity-40 group-hover/att:opacity-100"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
    </div>
  )
}
