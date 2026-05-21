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
  const { workspaceDir, setWorkspaceDir, workspaceCollapsed: collapsed, toggleWorkspace } = useAppStore()
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
      <div 
        className="h-full flex flex-col items-center pt-8 bg-surface/10 sidebar-transition relative shrink-0"
        style={{ width: 'var(--workspace-panel-collapsed)' }}
      >
        <div className="absolute inset-y-0 left-0 w-px bg-linear-to-b from-transparent via-black/[0.02] dark:via-white/[0.02] to-transparent" />
        <button
          onClick={toggleWorkspace}
          className="p-3 rounded-xl hover:bg-surface-secondary text-text-tertiary hover:text-text transition-all"
          title="Show workspace panel"
        >
          <Folder size={20} />
        </button>
      </div>
    )
  }

  return (
    <div 
      className="h-full flex flex-col overflow-hidden shrink-0 sidebar-transition bg-surface/20 backdrop-blur-3xl relative"
      style={{ width: 'var(--workspace-panel-width)' }}
    >
      <div className="absolute inset-y-0 left-0 w-px bg-linear-to-b from-transparent via-black/[0.03] dark:via-white/[0.05] to-transparent" />
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
      <div className="flex items-center justify-between px-10 h-48 border-b border-border-light bg-surface-secondary/20 backdrop-blur-3xl">
        <div className="flex items-center gap-4 text-[17px] font-bold tracking-tightest text-text uppercase tracking-[0.1em]">
          <Files size={20} className="text-accent/60" />
          Workspace
        </div>
        <button
          onClick={toggleWorkspace}
          className="p-2.5 rounded-2xl hover:bg-surface-secondary text-text-tertiary hover:text-text transition-all duration-500 hover:rotate-90"
          title="Collapse workspace panel"
        >
          <X size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-10 py-10 scrollbar-subtle space-y-12">
        {workspaceDir ? (
          <div className="space-y-12 animate-fade-in-up">
            {/* Directory path display - Poster style */}
            <div className="group relative rounded-[32px] border border-border-light bg-white dark:bg-white/5 p-6 transition-all duration-700 hover:shadow-2xl hover:shadow-accent/5 hover:-translate-y-2 overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-accent/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-accent/10 transition-colors" />
              
              <div className="flex items-start gap-5 relative z-10">
                <div className="p-3.5 rounded-[20px] bg-accent-subtle text-accent shadow-sm">
                  <FolderOpen size={24} strokeWidth={2.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold uppercase tracking-[0.5em] text-accent/60 mb-3">
                    Active Environment
                  </div>
                  <p className="text-[14px] font-mono text-text-secondary break-all leading-relaxed font-bold bg-surface-secondary/50 p-4 rounded-[18px] border border-black/[0.02] dark:border-white/[0.02] shadow-inner">
                    {workspaceDir}
                  </p>
                </div>
              </div>
            </div>

            {/* Actions - Gallery buttons */}
            <div className="flex gap-4 px-2">
              <button
                onClick={handleSelectDir}
                className="flex-1 text-[14px] px-6 py-4 rounded-[22px] bg-accent text-white font-extrabold hover:bg-accent-light transition-all duration-500 shadow-xl shadow-accent/20 hover:shadow-accent/40 hover:-translate-y-2 active:translate-y-0"
              >
                Switch Path
              </button>
              <button
                onClick={handleClear}
                className="text-[14px] px-6 py-4 rounded-[22px] bg-surface-secondary text-text-secondary hover:text-red-500 hover:bg-red-500/10 border border-border-light transition-all duration-500 font-extrabold hover:-translate-y-2 active:translate-y-0"
              >
                Reset
              </button>
            </div>

            {/* File Tree */}
            <div className="pt-4">
              <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.2em] text-accent mb-4 px-1 opacity-60">
                <Files size={16} />
                Explorer
              </div>
              <div className="-mx-2 px-1">
                <FileTree
                  rootPath={workspaceDir.startsWith('selected://') ? '' : workspaceDir}
                />
              </div>
            </div>
          </div>
        ) : showInput ? (
          <div className="space-y-4">
            <button
              onClick={() => setShowInput(false)}
              className="flex items-center gap-2 text-[12px] font-bold text-text-tertiary hover:text-text transition-all"
            >
              <ChevronLeft size={16} />
              Back
            </button>
            <p className="text-sm font-bold text-text tracking-tight">
              Enter workspace path
            </p>
            <p className="text-[11px] text-text-tertiary leading-relaxed font-medium">
              Example: <code className="text-[11px] bg-surface-secondary px-1 rounded">C:\Users\name\project</code>
            </p>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInputSubmit()}
              placeholder="C:\\Users\\...\\project"
              className="w-full px-5 py-4 rounded-[18px] bg-surface border border-border text-xs font-mono focus:ring-4 focus:ring-accent-subtle focus:border-accent/40 outline-none transition-all shadow-inner"
              autoFocus
            />
            <button
              onClick={handleInputSubmit}
              disabled={!inputValue.trim()}
              className="w-full flex items-center justify-center gap-2 text-xs px-6 py-4 rounded-[18px] bg-accent text-white font-bold hover:opacity-90 disabled:opacity-40 transition-all shadow-xl shadow-accent/20"
            >
              <Check size={16} strokeWidth={2.5} />
              Confirm Path
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center py-16">
            <div className="w-16 h-16 rounded-[22px] bg-surface-secondary border border-border flex items-center justify-center mb-8 shadow-sm">
              <FolderOpen size={32} className="text-text-tertiary opacity-40" />
            </div>
            <h3 className="text-lg font-bold text-text mb-2 tracking-tight">
              No Workspace
            </h3>
            <p className="text-[13px] text-text-tertiary mb-10 max-w-[200px] leading-relaxed font-medium opacity-70">
              Select a project directory to enable workspace features
            </p>
            <button
              onClick={handleSelectDir}
              className="flex items-center gap-3 text-xs px-8 py-4 rounded-2xl bg-accent text-white font-bold hover:opacity-90 transition-all shadow-2xl shadow-accent/20 active:scale-95"
            >
              <Folder size={16} />
              Select Folder
            </button>
            <button
              onClick={() => setShowInput(true)}
              className="mt-4 text-[12px] text-text-tertiary hover:text-accent underline underline-offset-4 transition-all font-bold opacity-60 hover:opacity-100"
            >
              Or enter path manually
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
