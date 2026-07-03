import { useState, useCallback, useEffect, useRef, type DragEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Folder, ChevronRight, ChevronDown, File,
  FileText, Image, Music,
  Archive, Code,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useFilePreviewStore } from '../../stores/filePreviewStore'

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

function openFilePreview(path: string, name: string) {
  useFilePreviewStore.getState().openFile(path, name)
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

  useEffect(() => {
    if (depth !== 0 || !isDir) return
    loadChildren()
    setExpanded(true)
  }, [depth, isDir, loadChildren])

  const handleMouseDown = useCallback(() => {
    draggingRef.current = false
  }, [])

  const handleMouseUp = useCallback(() => {
    if (draggingRef.current) return
    if (isDir) {
      if (!expanded && !loadedRef.current) loadChildren()
      setExpanded((prev) => !prev)
    } else {
      openFilePreview(path, name)
    }
  }, [isDir, expanded, loadChildren, path, name])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        if (isDir) {
          if (!expanded && !loadedRef.current) loadChildren()
          setExpanded((prev) => !prev)
        } else {
          openFilePreview(path, name)
        }
      }
    },
    [isDir, expanded, loadChildren, path, name],
  )

  const handleDragStart = useCallback(
    (e: DragEvent) => {
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
  const paddingLeft = depth * 12 + 6
  const isNodeModules = name === 'node_modules'

  return (
    <div className="mb-px">
      <div
        role="button"
        tabIndex={0}
        aria-label={`${name}, ${isDir ? 'folder' : 'file'}`}
        draggable={true}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onKeyDown={handleKeyDown}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        className="w-full flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-surface-secondary/70 transition-all duration-200 text-left select-none outline-none focus-visible:ring-2 focus-visible:ring-accent/30 group/tree-item"
        style={{ paddingLeft: `${paddingLeft}px` }}
        title={path}
      >
        {/* Expand/collapse chevron — only for directories */}
        {isDir ? (
          children !== null && children.length === 0 ? (
            <span className="w-4 shrink-0" />
          ) : (
            <span className="w-3.5 shrink-0 text-text-quaternary group-hover/tree-item:text-accent transition-colors">
              {loading ? (
                <span className="inline-block w-2.5 h-2.5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              ) : expanded ? (
                <ChevronDown size={11} strokeWidth={2.4} />
              ) : (
                <ChevronRight size={11} strokeWidth={2.4} />
              )}
            </span>
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}

        {/* File/folder icon */}
        <span className={`shrink-0 transition-transform duration-500 group-hover/tree-item:scale-110 ${isNodeModules ? 'opacity-30' : ''}`}>
          {isDir ? (
            expanded ? (
              <Folder size={12} className="text-accent" fill="currentColor" fillOpacity={0.12} strokeWidth={1.9} />
            ) : (
              <Folder size={12} className="text-accent/60" strokeWidth={1.9} />
            )
          ) : (
            <Icon size={12} className="text-text-quaternary group-hover/tree-item:text-text-secondary" strokeWidth={1.5} />
          )}
        </span>

        {/* Name */}
        <span
          className={`text-[11px] truncate tracking-tight leading-5 transition-colors duration-200 ${
            isNodeModules
              ? 'text-text-quaternary italic'
              : isDir
                ? 'text-text font-semibold'
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
              className="text-[9px] text-text-quaternary italic px-2 py-0.5"
              style={{ paddingLeft: `${paddingLeft + 12}px` }}
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
