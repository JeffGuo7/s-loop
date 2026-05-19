import { useState, useCallback, useRef } from 'react'
import {
  Folder, ChevronRight, ChevronDown, File,
  FileText, Image, Music,
  Archive, Code,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface FileEntry {
  name: string
  path: string
  is_dir: boolean
  size: number | null
}

interface FileTreeProps {
  rootPath: string
}

function getFileIcon(name: string): LucideIcon {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const imgExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp']
  const codeExts = ['ts', 'tsx', 'js', 'jsx', 'json', 'css', 'scss', 'html', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'hpp', 'yaml', 'yml', 'toml', 'xml', 'sh', 'bash', 'sql', 'graphql', 'prisma']
  const docExts = ['md', 'mdx', 'txt', 'pdf', 'doc', 'docx', 'csv', 'xlsx']
  const arcExts = ['zip', 'tar', 'gz', 'rar', '7z']
  const mediaExts = ['mp3', 'wav', 'ogg', 'flac']

  if (imgExts.includes(ext)) return Image
  if (codeExts.includes(ext)) return Code
  if (docExts.includes(ext)) return FileText
  if (arcExts.includes(ext)) return Archive
  if (mediaExts.includes(ext)) return Music
  return File
}

function attachFileByEvent(path: string, name: string) {
  window.dispatchEvent(
    new CustomEvent('snotra-file-attach', {
      detail: { path, name },
    }),
  )
}

export function FileTree({ rootPath }: FileTreeProps) {
  if (!rootPath) return null
  return (
    <TreeNode
      path={rootPath}
      name={rootPath.split(/[/\\]/).pop() || rootPath}
      depth={0}
      isDir
    />
  )
}

interface TreeNodeProps {
  path: string
  name: string
  depth: number
  isDir: boolean
}

function TreeNode({ path, name, depth, isDir }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<FileEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const loadedRef = useRef(false)
  const draggingRef = useRef(false)

  const loadChildren = useCallback(async () => {
    if (loadedRef.current || !isDir) return
    setLoading(true)
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const entries = await invoke<FileEntry[]>('list_directory', { path })
      setChildren(entries)
      loadedRef.current = true
    } catch {
      setChildren([])
    } finally {
      setLoading(false)
    }
  }, [path, isDir])

  const handleMouseDown = useCallback(() => {
    draggingRef.current = false
  }, [])

  const handleMouseUp = useCallback(() => {
    if (draggingRef.current) return
    if (isDir) {
      if (!expanded && !loadedRef.current) loadChildren()
      setExpanded((prev) => !prev)
    } else {
      attachFileByEvent(path, name)
    }
  }, [isDir, expanded, loadChildren, path, name])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        if (isDir) {
          if (!expanded && !loadedRef.current) loadChildren()
          setExpanded((prev) => !prev)
        } else {
          attachFileByEvent(path, name)
        }
      }
    },
    [isDir, expanded, loadChildren, path, name],
  )

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      draggingRef.current = true
      e.dataTransfer.setData('text/plain', path)
      e.dataTransfer.setData('application/x-snotra-file', JSON.stringify({ path, name }))
      e.dataTransfer.effectAllowed = 'copy'
    },
    [path, name],
  )

  const handleDragEnd = useCallback(() => {
    // Reset after the browser finishes its drag-op, so the next click isn't blocked
    setTimeout(() => {
      draggingRef.current = false
    }, 0)
  }, [])

  const Icon = getFileIcon(name)
  const paddingLeft = depth * 16 + 8
  const isNodeModules = name === 'node_modules'

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        draggable={!isDir}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onKeyDown={handleKeyDown}
        onDragStart={!isDir ? handleDragStart : undefined}
        onDragEnd={!isDir ? handleDragEnd : undefined}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[var(--color-surface-secondary)] transition-colors text-left select-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        style={{ paddingLeft: `${paddingLeft}px` }}
        title={path}
      >
        {/* Expand/collapse chevron — only for directories */}
        {isDir ? (
          children !== null && children.length === 0 ? (
            <span className="w-4 shrink-0" />
          ) : (
            <span className="w-4 shrink-0 text-[var(--color-text-quaternary)]">
              {loading ? (
                <span className="inline-block w-3 h-3 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
              ) : expanded ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
            </span>
          )
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {/* File/folder icon */}
        <span className={`shrink-0 ${isNodeModules ? 'opacity-40' : ''}`}>
          {isDir ? (
            expanded ? (
              <Folder size={15} className="text-[var(--color-accent)]" fill="var(--color-accent-muted)" />
            ) : (
              <Folder size={15} className="text-[var(--color-accent-light)]" />
            )
          ) : (
            <Icon size={15} className="text-[var(--color-text-tertiary)]" />
          )}
        </span>

        {/* Name */}
        <span
          className={`text-xs truncate ${
            isNodeModules
              ? 'text-[var(--color-text-quaternary)] italic'
              : isDir
                ? 'text-[var(--color-text)]'
                : 'text-[var(--color-text-secondary)]'
          }`}
        >
          {name}
        </span>
      </div>

      {/* Children — only for directories */}
      {isDir && expanded && children && (
        <div>
          {children.length === 0 ? (
            <div
              className="text-[10px] text-[var(--color-text-quaternary)] italic px-2 py-1"
              style={{ paddingLeft: `${paddingLeft + 20}px` }}
            >
              Empty
            </div>
          ) : (
            children.map((child) => (
              <TreeNode
                key={child.path}
                path={child.path}
                name={child.name}
                depth={depth + 1}
                isDir={child.is_dir}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}
