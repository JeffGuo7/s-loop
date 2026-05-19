import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Folder, FolderOpen, Check, ChevronLeft, Files } from 'lucide-react'
import { useAppStore } from '../../stores'
import { Kilo } from '../../utils'
import { FileTree } from './FileTree'

/**
 * Detect if running inside Tauri webview
 */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function WorkspacePanel() {
  const { workspaceDir, setWorkspaceDir } = useAppStore()
  const [collapsed, setCollapsed] = useState(false)
  const [showInput, setShowInput] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const hiddenInputRef = useRef<HTMLInputElement>(null)

  // Sync persisted workspaceDir to Kilo on mount
  useEffect(() => {
    Kilo.setProjectDir(workspaceDir)
  }, [workspaceDir])

  const applyDir = useCallback((dir: string) => {
    setWorkspaceDir(dir)
    Kilo.setProjectDir(dir)
    setShowInput(false)
    setInputValue('')
  }, [setWorkspaceDir])

  const handleSelectDir = useCallback(async () => {
    // ── Tauri native dialog ──
    if (isTauri()) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog')
        const selected = await open({ directory: true, multiple: false })
        if (!selected) return
        const dir = typeof selected === 'string' ? selected : (selected as { path?: string }).path || ''
        if (dir) applyDir(dir)
      } catch {
        setShowInput(true)
      }
      return
    }

    // ── Browser: File System Access API (Chrome/Edge) ──
    try {
      const handle = await (window as any).showDirectoryPicker()
      // showDirectoryPicker doesn't expose a full path, use the handle name
      const dirName = handle.name
      // Try to get more info via the native file system access API
      // Unfortunately no full path is available in browser for security
      applyDir(`selected://${dirName}`)
    } catch (err: unknown) {
      // User cancelled or API not supported
      if ((err as DOMException)?.name === 'AbortError' || (err as DOMException)?.name === 'SecurityError') {
        return
      }
      // ── Browser fallback: hidden <input webkitdirectory> ──
      if (hiddenInputRef.current) {
        hiddenInputRef.current.value = ''
        hiddenInputRef.current.click()
      }
    }
  }, [applyDir])

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    // webkitRelativePath gives us the relative path from the selected root
    const firstPath = files[0].webkitRelativePath
    if (firstPath) {
      // Extract the root folder name from the first file's webkitRelativePath
      const rootName = firstPath.split('/')[0]
      // The full path isn't available in browser, so we store the root name
      applyDir(`selected://${rootName}`)
    } else {
      applyDir(`selected://${files[0].name}`)
    }
  }, [applyDir])

  const handleClear = useCallback(() => {
    setWorkspaceDir(null)
    Kilo.setProjectDir(null)
  }, [setWorkspaceDir])

  const handleInputSubmit = useCallback(() => {
    if (inputValue.trim()) {
      applyDir(inputValue.trim())
    }
  }, [inputValue, applyDir])

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="w-8 flex items-center justify-center border-l border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-secondary)] transition-colors"
        title="Show workspace panel"
      >
        <Folder size={14} />
      </button>
    )
  }

  return (
    <div className="w-64 border-l border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col overflow-hidden shrink-0 animate-slide-in-right">
      {/* Hidden file input for browser fallback */}
      <input
        ref={hiddenInputRef}
        type="file"
        /* @ts-ignore - webkitdirectory is a non-standard attribute */
        webkitdirectory=""
        directory=""
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-light)]">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
          <Folder size={14} className="text-[var(--color-accent)]" />
          Workspace
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="p-1 rounded-md hover:bg-[var(--color-surface-secondary)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] transition-colors"
          title="Collapse workspace panel"
        >
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-subtle">
        {workspaceDir ? (
          <div className="space-y-4">
            {/* Directory path display */}
            <div className="flex items-start gap-2 p-3 rounded-xl bg-[var(--color-surface-secondary)] border border-[var(--color-border-light)]">
              <FolderOpen size={16} className="text-[var(--color-accent)] shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1">
                  Project Root
                </div>
                <p className="text-xs font-mono text-[var(--color-text-secondary)] break-all leading-relaxed">
                  {workspaceDir}
                </p>
                {workspaceDir.startsWith('selected://') && !isTauri() && (
                  <p className="text-[10px] text-[var(--color-warning)] mt-1">
                    Full path unavailable in browser. Use Tauri app or enter path manually.
                  </p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={handleSelectDir}
                className="flex-1 text-xs px-3 py-2 rounded-xl bg-[var(--color-accent)] text-white font-semibold hover:opacity-90 transition-opacity"
              >
                Change
              </button>
              <button
                onClick={handleClear}
                className="text-xs px-3 py-2 rounded-xl bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)] hover:text-[var(--color-error)] hover:bg-[var(--color-error-bg)] border border-[var(--color-border-light)] transition-colors font-medium"
              >
                Clear
              </button>
            </div>

            {/* File Tree */}
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1 px-1">
                <Files size={12} />
                Explorer
              </div>
              <div className="-mx-2">
                <FileTree
                  rootPath={workspaceDir.startsWith('selected://') ? '' : workspaceDir}
                />
              </div>
            </div>
          </div>
        ) : showInput ? (
          <div className="space-y-3">
            <button
              onClick={() => setShowInput(false)}
              className="flex items-center gap-1 text-[11px] font-medium text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] transition-colors"
            >
              <ChevronLeft size={14} />
              Back
            </button>
            <p className="text-xs font-medium text-[var(--color-text-secondary)]">
              Enter workspace path
            </p>
            <p className="text-[10px] text-[var(--color-text-tertiary)] leading-relaxed">
              Example: <code className="text-[10px]">C:\Users\name\project</code> on Windows
            </p>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInputSubmit()}
              placeholder="C:\\Users\\...\\project"
              className="w-full px-3 py-2 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-xs font-mono focus:ring-2 focus:ring-[var(--color-accent)] outline-none transition-all"
              autoFocus
            />
            <button
              onClick={handleInputSubmit}
              disabled={!inputValue.trim()}
              className="w-full flex items-center justify-center gap-1.5 text-xs px-4 py-2.5 rounded-xl bg-[var(--color-accent)] text-white font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              <Check size={14} />
              Confirm
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center py-8">
            <div className="w-12 h-12 rounded-2xl bg-[var(--color-surface-secondary)] border border-[var(--color-border)] flex items-center justify-center mb-4">
              <FolderOpen size={24} className="text-[var(--color-text-tertiary)] opacity-50" />
            </div>
            <p className="text-sm font-semibold text-[var(--color-text-secondary)] mb-1">
              No Workspace
            </p>
            <p className="text-[11px] text-[var(--color-text-tertiary)] mb-5 max-w-[180px] leading-relaxed">
              Select a project directory to enable workspace features
            </p>
            <button
              onClick={handleSelectDir}
              className="flex items-center gap-2 text-xs px-5 py-2.5 rounded-xl bg-[var(--color-accent)] text-white font-semibold hover:opacity-90 transition-opacity shadow-sm shadow-[var(--color-accent)]/20"
            >
              <Folder size={14} />
              Select Folder
            </button>
            <button
              onClick={() => setShowInput(true)}
              className="mt-2 text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] underline underline-offset-2 transition-colors"
            >
              Or enter path manually
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
