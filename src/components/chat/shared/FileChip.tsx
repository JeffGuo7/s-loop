import { File, Folder, FolderOpen } from 'lucide-react'
import { useState } from 'react'
import { useAppStore } from '../../../stores/appStore'
import { useFilePreviewStore } from '../../../stores/filePreviewStore'

interface FileChipProps {
  name: string
  path?: string
  isFolder?: boolean
  /** Render on a dark/accent background (e.g. user message bubble) */
  onDark?: boolean
}

function isAbsolutePath(path: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith('\\\\') || path.startsWith('/')
}

function resolvePreviewPath(path: string, workspaceDir: string | null): string | null {
  if (isAbsolutePath(path)) return path
  if (!workspaceDir) return null
  return `${workspaceDir.replace(/[\\/]+$/, '')}/${path.replace(/^[\\/]+/, '')}`
}

const EXT_COLORS: Record<string, string> = {
  ts: '#3178c6', tsx: '#3178c6', js: '#f7df1e', jsx: '#f7df1e',
  py: '#3776ab', rs: '#dea584', go: '#00add8', java: '#b07219',
  css: '#1572b6', html: '#e34f26', json: '#292929', yaml: '#6d8a9e',
  md: '#083fa1', sql: '#e38c00', sh: '#4eaa25', bash: '#4eaa25',
  vue: '#42b883', svelte: '#ff3e00', swift: '#f05138', kt: '#7f52ff',
  dart: '#00b4ab', xml: '#0060ac', toml: '#9c4221', dockerfile: '#2496ed',
}

function getExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot === -1) return ''
  return name.slice(dot + 1).toLowerCase()
}

function getAccentColor(name: string): string {
  const ext = getExtension(name)
  return EXT_COLORS[ext] || 'var(--color-accent)'
}

export function FileChip({ name, path, isFolder, onDark }: FileChipProps) {
  const [hover, setHover] = useState(false)
  const ext = isFolder ? '' : getExtension(name)
  const workspaceDir = useAppStore((s) => s.workspaceDir)

  const previewPath = path && !isFolder && !/^https?:\/\//i.test(path)
    ? resolvePreviewPath(path, workspaceDir)
    : null
  // Category detection in filePreviewStore keys off the file extension, so
  // always hand it the path basename — the chip label may be arbitrary text.
  const pathBase = previewPath ? previewPath.split(/[\\/]/).pop() || name : name

  const handleOpen = previewPath
    ? () => useFilePreviewStore.getState().openFile(previewPath, pathBase)
    : undefined

  const bg = onDark ? 'rgba(255,255,255,0.12)' : 'var(--color-surface-secondary)'
  const border = onDark ? 'rgba(255,255,255,0.15)' : 'var(--color-border)'
  const borderHover = onDark ? 'rgba(255,255,255,0.35)' : getAccentColor(name) + '60'
  const textColor = onDark ? 'inherit' : 'var(--color-text)'
  const iconColor = onDark ? 'rgba(255,255,255,0.7)' : 'var(--color-text-tertiary)'
  const extBg = onDark ? 'rgba(255,255,255,0.15)' : getAccentColor(name) + '18'
  const extColor = onDark ? 'rgba(255,255,255,0.9)' : getAccentColor(name)

  return (
    <span
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all duration-300 select-none align-middle mx-0.5 ${previewPath ? 'cursor-pointer' : 'cursor-default'}`}
      style={{
        backgroundColor: bg,
        borderColor: hover ? borderHover : border,
        boxShadow: hover ? `0 2px 12px rgba(0,0,0,0.12)` : 'none',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={handleOpen}
      title={previewPath ? `${path || name} — click to preview` : (path || name)}
    >
      {isFolder ? (
        hover ? <FolderOpen size={16} className="shrink-0" style={{ color: onDark ? 'rgba(255,255,255,0.9)' : 'var(--color-accent)' }} /> : <Folder size={16} className="shrink-0" style={{ color: iconColor }} />
      ) : (
        <File size={16} className="shrink-0" style={{ color: hover && !onDark ? getAccentColor(name) : iconColor }} />
      )}
      <span className="text-[13px] font-medium leading-none truncate max-w-[200px]" style={{ color: textColor }}>
        {name}
      </span>
      {ext && (
        <span
          className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md leading-none shrink-0"
          style={{
            backgroundColor: extBg,
            color: extColor,
          }}
        >
          {ext}
        </span>
      )}
    </span>
  )
}

/** Parse a link text like "File: foo.ts" or "Folder: bar" and return chip props */
export function parseFileLink(text: string): { name: string; isFolder: boolean } | null {
  const fileMatch = text.match(/^File:\s+(.+)$/)
  if (fileMatch) return { name: fileMatch[1].trim(), isFolder: false }

  const folderMatch = text.match(/^Folder:\s+(.+)$/)
  if (folderMatch) return { name: folderMatch[1].trim(), isFolder: true }

  return null
}
