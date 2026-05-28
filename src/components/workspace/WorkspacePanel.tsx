import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen, Check, ChevronLeft, Files, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAppStore } from '../../stores'
import { FileTree } from './FileTree'
import { AgentBuilder } from '../agent-builder'

/**
 * Detect if running inside Tauri webview
 */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function WorkspacePanel() {
  const { t } = useTranslation()
  const { workspaceDir, setWorkspaceDir, workspaceCollapsed: collapsed, toggleWorkspace } = useAppStore()
  const [showInput, setShowInput] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const hiddenInputRef = useRef<HTMLInputElement>(null)

  const applyDir = useCallback((dir: string) => {
    setWorkspaceDir(dir)
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
      const dirName = handle.name
      applyDir(`selected://${dirName}`)
    } catch (err: unknown) {
      if ((err as DOMException)?.name === 'AbortError' || (err as DOMException)?.name === 'SecurityError') {
        return
      }
      if (hiddenInputRef.current) {
        hiddenInputRef.current.value = ''
        hiddenInputRef.current.click()
      }
    }
  }, [applyDir])

  const handleClear = useCallback(() => {
    setWorkspaceDir(null)
  }, [setWorkspaceDir])

  const handleInputSubmit = useCallback(() => {
    if (inputValue.trim()) {
      applyDir(inputValue.trim())
    }
  }, [inputValue, applyDir])

  if (collapsed) {
    return (
      <aside 
        className="h-full flex flex-col items-center pt-10 bg-transparent sidebar-transition relative shrink-0"
        style={{ width: 'var(--spacing-workspace-panel-collapsed)' }}
      >
        <motion.button
          whileHover={{ scale: 1.1, x: -2 }}
          whileTap={{ scale: 0.9 }}
          onClick={toggleWorkspace}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-secondary/80 text-accent shadow-lg shadow-accent/5 border border-white/10 backdrop-blur-md transition-all duration-500 hover:shadow-accent/20"
          title={t('workspace.tooltip')}
        >
          <FolderOpen size={16} strokeWidth={2.5} />
        </motion.button>
      </aside>
    )
  }

  return (
    <aside 
      className="h-full flex flex-col overflow-hidden shrink-0 sidebar-transition bg-transparent relative pt-10"
      style={{ width: 'var(--spacing-workspace-panel)' }}
    >
      {/* Left Edge - Removed for consistency */}
      
      {/* Header - Refined & Balanced */}
      <div className="flex items-start justify-between px-5 pt-6 pb-4 relative z-10">
        <div className="flex flex-col">
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-accent opacity-40 mb-0.5">
            {t('workspace.resource')}
          </span>
          <h2 className="text-[17px] font-black text-text tracking-tighter leading-none">
            {t('workspace.title')}
          </h2>
        </div>
        <motion.button
          whileHover={{ scale: 1.05, x: 2 }}
          whileTap={{ scale: 0.95 }}
          onClick={toggleWorkspace}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-secondary/60 text-text-tertiary hover:text-accent transition-all duration-500 shadow-sm border border-black/5 dark:border-white/5 mt-0.5"
        >
          <ChevronRight size={14} strokeWidth={2.5} />
        </motion.button>
      </div>

      {/* Content - Split: Workspace (upper) + Agent Builder (lower) */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="overflow-y-auto px-5 flex-1 min-h-0 scrollbar-subtle">
          <div className="pb-1 space-y-5">
          {workspaceDir ? (
            <div className="space-y-4 animate-fade-in-up">
              {/* Directory path display - Refined style */}
              <div className="group relative rounded-lg border border-border-light bg-white dark:bg-white/5 p-3.5 transition-all duration-500 hover:shadow-md hover:shadow-accent/5 overflow-hidden shadow-xs">
                <div className="flex items-start gap-2.5 relative z-10">
                  <div className="p-1.5 rounded-md bg-accent/10 text-accent">
                    <FolderOpen size={14} strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[8px] font-black uppercase tracking-[0.15em] text-accent/60 mb-1">
                      {t('workspace.environment')}
                    </div>
                    <div className="bg-surface-secondary/40 p-2 rounded-md border border-black/[0.01] dark:border-white/[0.01] shadow-inner">
                      <p className="text-[10px] font-mono text-text-secondary break-all leading-relaxed font-semibold">
                        {workspaceDir}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions - Refined buttons */}
              <div className="flex gap-2 px-0.5">
                <motion.button
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSelectDir}
                  className="flex-1 text-[11px] px-3 py-2 rounded-lg bg-accent text-white font-bold hover:bg-accent-light transition-all duration-500 shadow-lg shadow-accent/10"
                >
                  {t('workspace.switch')}
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleClear}
                  className="text-[11px] px-3 py-2 rounded-lg bg-surface-secondary text-text-secondary hover:text-red-500 hover:bg-red-500/10 border border-border-light transition-all duration-500 font-bold"
                >
                  {t('workspace.reset')}
                </motion.button>
              </div>

              {/* File Tree */}
              <div className="pt-1">
                <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.15em] text-accent mb-2.5 px-0.5 opacity-60">
                  <Files size={12} />
                  {t('workspace.explorer')}
                </div>
                <div className="-mx-1.5 px-0.5">
                  <FileTree
                    rootPath={workspaceDir.startsWith('selected://') ? '' : workspaceDir}
                  />
                </div>
              </div>
            </div>
          ) : showInput ? (
            <div className="space-y-3.5">
              <button
                onClick={() => setShowInput(false)}
                className="flex items-center gap-1.5 text-[10px] font-bold text-text-tertiary hover:text-text transition-all"
              >
                <ChevronLeft size={12} />
                {t('workspace.back')}
              </button>
              <p className="text-[12px] font-bold text-text tracking-tight">
                {t('workspace.enterPath')}
              </p>
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInputSubmit()}
                placeholder={t('workspace.pathPlaceholder')}
                className="w-full px-3.5 py-2.5 rounded-lg bg-surface border border-border text-[10px] font-mono focus:ring-4 focus:ring-accent-subtle focus:border-accent/40 outline-none transition-all shadow-inner"
                autoFocus
              />
              <button
                onClick={handleInputSubmit}
                disabled={!inputValue.trim()}
                className="w-full flex items-center justify-center gap-2 text-[11px] px-4 py-2.5 rounded-lg bg-accent text-white font-bold hover:opacity-90 disabled:opacity-40 transition-all shadow-xl shadow-accent/20"
              >
                <Check size={13} strokeWidth={2.5} />
                {t('workspace.confirm')}
              </button>
            </div>
          ) : (
              <div className="flex flex-col items-center text-center py-8 px-4">
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="w-16 h-16 rounded-full bg-surface-secondary/40 border border-border-light flex items-center justify-center mb-6 shadow-sm relative overflow-hidden group/empty"
                >
                  <div className="absolute inset-0 bg-linear-to-br from-accent/5 to-transparent opacity-0 group-hover/empty:opacity-100 transition-opacity duration-700" />
                  <FolderOpen size={24} className="text-accent/30 relative z-10 group-hover/empty:scale-110 transition-transform duration-500" />
                </motion.div>
                
                <h3 className="text-[16px] font-black text-text mb-1.5 tracking-tighter">
                  {t('workspace.emptyTitle')}
                </h3>
                <p className="text-[11px] text-text-tertiary mb-8 max-w-[160px] leading-relaxed font-medium opacity-60">
                  {t('workspace.emptyDesc')}
                </p>
                
                <div className="w-full space-y-2.5">
                  <motion.button
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSelectDir}
                    className="w-full flex items-center justify-center gap-2 text-[11px] px-5 py-3 rounded-lg bg-accent text-white font-black hover:bg-accent-light transition-all duration-500 shadow-xl shadow-accent/10"
                  >
                    <FolderOpen size={13} strokeWidth={2.5} />
                    {t('workspace.openProject')}
                  </motion.button>

                  <button
                    onClick={() => setShowInput(true)}
                    className="w-full text-[10px] text-text-tertiary hover:text-accent font-bold transition-all duration-300 opacity-50 hover:opacity-100 py-1.5"
                  >
                    {t('workspace.enterPathManually')}
                  </button>
                </div>
              </div>
            )}
        </div>
      </div>

      {/* Lower: Agent Builder */}
      <AgentBuilder />
    </div>
    </aside>
  )
}
