import { useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
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
    new CustomEvent('s-loop-file-attach', {
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
  const { t } = useTranslation()
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
      e.dataTransfer.setData('application/x-s-loop-file', JSON.stringify({ path, name, isDir }))
      e.dataTransfer.effectAllowed = 'copy'
    },
    [path, name, isDir],
  )

  const handleDragEnd = useCallback(() => {
    // Reset after the browser finishes its drag-op, so the next click isn't blocked
    setTimeout(() => {
      draggingRef.current = false
    }, 0)
  }, [])

  const Icon = getFileIcon(name)
  const paddingLeft = depth * 16 + 10
  const isNodeModules = name === 'node_modules'

  return (
    <div className="mb-0.5">
      <div
        role="button"
        tabIndex={0}
        draggable={true}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onKeyDown={handleKeyDown}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface-secondary/60 transition-all duration-300 text-left select-none outline-none focus-visible:ring-2 focus-visible:ring-accent group/tree-item"
        style={{ paddingLeft: `${paddingLeft}px` }}
        title={path}
      >
        {/* Expand/collapse chevron — only for directories */}
        {isDir ? (
          children !== null && children.length === 0 ? (
            <span className="w-4 shrink-0" />
          ) : (
            <span className="w-4 shrink-0 text-text-quaternary group-hover/tree-item:text-accent transition-colors">
              {loading ? (
                <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              ) : expanded ? (
                <ChevronDown size={13} strokeWidth={2.5} />
              ) : (
                <ChevronRight size={13} strokeWidth={2.5} />
              )}
            </span>
          )
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {/* File/folder icon */}
        <span className={`shrink-0 transition-transform duration-500 group-hover/tree-item:scale-110 ${isNodeModules ? 'opacity-30' : ''}`}>
          {isDir ? (
            expanded ? (
              <Folder size={14} className="text-accent" fill="currentColor" fillOpacity={0.15} strokeWidth={2} />
            ) : (
              <Folder size={14} className="text-accent/60" strokeWidth={2} />
            )
          ) : (
            <Icon size={14} className="text-text-quaternary group-hover/tree-item:text-text-secondary" strokeWidth={1.5} />
          )}
        </span>

        {/* Name */}
        <span
          className={`text-[12px] truncate tracking-tight transition-colors duration-300 ${
            isNodeModules
              ? 'text-text-quaternary italic'
              : isDir
                ? 'text-text font-bold'
                : 'text-text-secondary group-hover/tree-item:text-text'
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
              className="text-[9px] text-[var(--color-text-quaternary)] italic px-2 py-0.5"
              style={{ paddingLeft: `${paddingLeft + 16}px` }}
            >
              {t('workspace.empty')}
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
