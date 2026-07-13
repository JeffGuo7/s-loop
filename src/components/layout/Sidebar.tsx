import { useCallback, useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  MessageSquare,
  Plus,
  Trash2,
  Settings,
  ChevronLeft,
  ChevronRight,
  PawPrint,
  Send,
  Moon,
  Sun,
  Clock,
  Target,
  FolderOpen,
  MessagesSquare,
  FolderTree,
  RefreshCw,
  RotateCcw,
  X,
  Puzzle,
  type LucideIcon,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { useAppStore } from '../../stores'
import { MagicButton } from '../ui'
import { FileTree } from '../workspace/FileTree'
import type { Page } from '../../App'

interface SidebarProps {
  onSettingsOpen: () => void
  currentPage: Page
  onNavigate: (page: Page) => void
  collapsed?: boolean
  onToggleCollapse?: () => void
  className?: string
}

export function Sidebar({
  onSettingsOpen,
  currentPage,
  onNavigate,
  collapsed = false,
  onToggleCollapse,
  className = '',
}: SidebarProps) {
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const streamingMessage = useAppStore((s) => s.streamingMessage)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const createSession = useAppStore((s) => s.createSession)
  const deleteSession = useAppStore((s) => s.deleteSession)
  const leftPanelMode = useAppStore((s) => s.leftPanelMode)
  const setLeftPanelMode = useAppStore((s) => s.setLeftPanelMode)
  const workspaceDir = useAppStore((s) => s.workspaceDir)
  const setWorkspaceDir = useAppStore((s) => s.setWorkspaceDir)
  const fileTreeVersion = useAppStore((s) => s.fileTreeVersion)
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const { t } = useTranslation()

  const handleNewChat = useCallback(() => {
    createSession()
    onNavigate('chat')
  }, [createSession, onNavigate])

  const handleSelect = useCallback(
    (id: string) => {
      if (id !== activeSessionId) setActiveSession(id)
      onNavigate('chat')
    },
    [activeSessionId, setActiveSession, onNavigate],
  )

  const [confirmDeleteSessionId, setConfirmDeleteSessionId] = useState<string | null>(null)
  const [confirmClearAll, setConfirmClearAll] = useState(false)

  const handleDelete = useCallback(
    (e: MouseEvent, id: string) => {
      e.stopPropagation()
      setConfirmDeleteSessionId(id)
    },
    [],
  )

  const handleConfirmDelete = useCallback(
    (e: MouseEvent, id: string) => {
      e.stopPropagation()
      deleteSession(id)
      setConfirmDeleteSessionId(null)
    },
    [deleteSession],
  )

  const handleCancelDelete = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation()
      setConfirmDeleteSessionId(null)
    },
    [],
  )

  useEffect(() => {
    if (!confirmDeleteSessionId && !confirmClearAll) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setConfirmDeleteSessionId(null)
        setConfirmClearAll(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmDeleteSessionId, confirmClearAll])

  const applyWorkspaceDir = useCallback((dir: string) => {
    setWorkspaceDir(dir)
    setLeftPanelMode('files')
  }, [setLeftPanelMode, setWorkspaceDir])

  const handleSelectDir = useCallback(async () => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog')
        const selected = await open({ directory: true, multiple: false })
        if (!selected) return
        const dir = typeof selected === 'string' ? selected : (selected as { path?: string }).path || ''
        if (dir) applyWorkspaceDir(dir)
        return
      } catch {
        return
      }
    }

    try {
      const handle = await (window as Window & { showDirectoryPicker?: () => Promise<{ name: string }> }).showDirectoryPicker?.()
      if (handle?.name) {
        applyWorkspaceDir(`selected://${handle.name}`)
        return
      }
    } catch (err: unknown) {
      if ((err as DOMException)?.name === 'AbortError' || (err as DOMException)?.name === 'SecurityError') {
        return
      }
    }

  }, [applyWorkspaceDir])

  const handleClearWorkspace = useCallback(() => {
    setWorkspaceDir(null)
  }, [setWorkspaceDir])

  const width = collapsed ? 'var(--spacing-sidebar-collapsed)' : 'var(--spacing-sidebar)'
  const isFilesMode = leftPanelMode === 'files'
  const normalizedWorkspaceDir = workspaceDir?.startsWith('selected://') ? '' : workspaceDir || ''

  return (
    <aside
      className={`h-full flex flex-col bg-transparent sidebar-transition shrink-0 z-20 relative group/sidebar ${className}`}
      style={{ width }}
    >
      <div className="px-4 pt-8 pb-6 relative z-10">
        {!collapsed ? (
          <div className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              <MagicButton
                onClick={handleNewChat}
                className="w-full gap-2.5 rounded-lg py-3.5 shadow-md shadow-accent/10 group transition-all duration-500 hover:shadow-accent/20 hover:-translate-y-0.5 active:translate-y-0"
              >
                <Plus size={16} strokeWidth={2.5} className="group-hover:rotate-90 transition-transform duration-500" />
                <span className="font-bold tracking-tight text-[14px]">{t('sidebar.newChat')}</span>
              </MagicButton>
            </motion.div>

            <div className="space-y-2 px-1">
              <div className="flex items-center gap-1.5 rounded-xl border border-border-light/80 bg-white/70 p-1 shadow-sm backdrop-blur-xl dark:bg-white/5">
                <button
                  onClick={() => setLeftPanelMode('sessions')}
                  className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-black tracking-tight transition-all duration-300 ${
                    !isFilesMode
                      ? 'bg-accent text-white shadow-lg shadow-accent/15'
                      : 'text-text-tertiary hover:text-text hover:bg-surface-secondary/70'
                  }`}
                >
                  <span className="flex items-center justify-center gap-2">
                    <MessagesSquare size={12} />
                    {t('sidebar.panelSessions')}
                  </span>
                </button>
                <button
                  onClick={() => setLeftPanelMode('files')}
                  className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-black tracking-tight transition-all duration-300 ${
                    isFilesMode
                      ? 'bg-accent text-white shadow-lg shadow-accent/15'
                      : 'text-text-tertiary hover:text-text hover:bg-surface-secondary/70'
                  }`}
                >
                  <span className="flex items-center justify-center gap-2">
                    <FolderTree size={12} />
                    {t('sidebar.panelFiles')}
                  </span>
                </button>
              </div>

              <div className="flex items-center justify-between px-1">
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.18em] text-accent/50">
                    {isFilesMode ? t('sidebar.fileWorkspace') : t('sidebar.workspace')}
                  </div>
                  <div className="mt-0.5 text-[13px] font-bold tracking-tight text-text">
                    {isFilesMode ? t('sidebar.fileExplorer') : t('sidebar.recent')}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {!isFilesMode && (
                    confirmClearAll ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            useAppStore.getState().clearSessions()
                            setConfirmClearAll(false)
                          }}
                          className="rounded-md bg-red-500 px-2 py-1 text-[10px] font-black text-white transition-all duration-300 hover:bg-red-600"
                        >
                          {t('common.confirm')}
                        </button>
                        <button
                          onClick={() => setConfirmClearAll(false)}
                          className="rounded-md bg-white/75 px-2 py-1 text-[10px] font-black text-text-tertiary transition-all duration-300 hover:text-text dark:bg-white/10"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmClearAll(true)}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-text-quaternary transition-all duration-300 hover:bg-red-500/10 hover:text-red-500"
                        title={t('sidebar.clearTitle')}
                      >
                        <Trash2 size={11} strokeWidth={2} />
                      </button>
                    )
                  )}
                  <motion.button
                    whileHover={{ scale: 1.05, x: -2 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onToggleCollapse}
                    className="flex h-7 w-7 items-center justify-center rounded-md bg-surface-secondary/80 text-text-tertiary transition-all duration-300 shadow-sm border border-black/5 hover:text-accent dark:border-white/5"
                    title={t('sidebar.collapseTitle')}
                  >
                    <ChevronLeft size={14} strokeWidth={2.5} />
                  </motion.button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 w-full items-center pt-2">
            <motion.div whileHover={{ scale: 1.1, rotate: 10 }} whileTap={{ scale: 0.9 }}>
              <MagicButton
                onClick={handleNewChat}
                className="w-11 h-11 rounded-xl shadow-xl shadow-accent/20"
              >
                <Plus size={22} strokeWidth={3} className="text-white" />
              </MagicButton>
            </motion.div>
            <button
              onClick={() => setLeftPanelMode(isFilesMode ? 'sessions' : 'files')}
              className={`w-10 h-10 rounded-xl border transition-all duration-300 flex items-center justify-center ${
                isFilesMode
                  ? 'bg-accent/12 text-accent border-accent/20 shadow-md shadow-accent/10'
                  : 'bg-surface-secondary/80 text-text-tertiary border-black/5 dark:border-white/5 hover:text-accent'
              }`}
              title={isFilesMode ? t('sidebar.backToSessions') : t('sidebar.openFileTree')}
            >
              {isFilesMode ? <MessagesSquare size={17} strokeWidth={2.4} /> : <FolderTree size={17} strokeWidth={2.4} />}
            </button>
            <motion.button
              whileHover={{ scale: 1.05, x: 2 }}
              whileTap={{ scale: 0.95 }}
              onClick={onToggleCollapse}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface-secondary/80 text-text-tertiary hover:text-accent transition-all duration-300 shadow-md border border-black/5 dark:border-white/5"
              title={t('sidebar.expandTitle')}
            >
              <ChevronRight size={16} strokeWidth={2.5} />
            </motion.button>
          </div>
        )}
      </div>

      {!isFilesMode ? (
        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-1 scrollbar-subtle space-y-1">
          {sessions.map((session) => {
          const isActive = session.id === activeSessionId
          const isStreaming = streamingMessage[session.id]?.isStreaming ?? false
          const title = session.title || t('sidebar.untitled')
          const isPlatformSession = session.source === 'platform'
          const sessionBadge = session.sourceLabel || (session.readOnly ? t('chat.session.readOnly') : '')

          if (collapsed) {
            return (
              <button
                key={session.id}
                onClick={() => handleSelect(session.id)}
                className={`group relative w-full h-10 rounded-lg transition-all duration-500 flex items-center justify-center border ${
                  isActive
                    ? 'bg-accent/15 border-accent/25 shadow-md ring-1 ring-accent/10 cursor-default'
                    : 'bg-transparent border-transparent hover:bg-surface-secondary/70 hover:border-black/5 dark:hover:border-white/5 cursor-pointer'
                }`}
              >
                <div className={`flex items-center justify-center w-6 h-6 rounded-md transition-all duration-500 ${
                  isActive ? 'bg-accent/15 text-accent shadow-sm shadow-accent/10' : 'bg-surface-tertiary/40 text-text-quaternary group-hover:text-text-secondary'
                }`}>
                  <MessageSquare size={13} strokeWidth={isActive ? 2.5 : 1.5} />
                </div>
                {isPlatformSession && (
                  <div className="absolute -top-1.5 -right-1.5 min-w-3 h-3 px-1 rounded-full bg-accent text-[8px] leading-3 font-black text-white shadow-sm">
                    P
                  </div>
                )}
                {isStreaming && !isActive && (
                  <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-accent border-2 border-white dark:border-[#1a1a1a] animate-pulse shadow-sm" />
                )}
                {isActive && (
                  <div className="absolute left-0 top-3 bottom-3 w-1 bg-accent rounded-r-full z-20 shadow-[2px_0_8px_rgba(var(--color-accent-rgb),0.3)]" />
                )}
              </button>
            )
          }

          return (
            <button
              key={session.id}
              onClick={() => handleSelect(session.id)}
              className={`group relative flex w-full min-h-[44px] items-center gap-2.5 rounded-lg border pl-3 pr-8 py-2 transition-all duration-500 ${
                isActive
                  ? 'bg-accent/8 dark:bg-accent/15 border-accent/25 shadow-md ring-1 ring-accent/10 cursor-default'
                  : 'bg-transparent border-transparent hover:bg-surface-secondary/70 hover:border-black/5 dark:hover:border-white/5 cursor-pointer'
              }`}
            >
              <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-all duration-500 ${
                isActive ? 'bg-accent/15 text-accent shadow-sm shadow-accent/10' : 'bg-surface-tertiary/40 text-text-quaternary group-hover:text-text-secondary'
              }`}>
                <MessageSquare size={13} strokeWidth={isActive ? 2.5 : 1.5} />
              </div>

              <div className="min-w-0 flex-1 text-left">
                <p className={`truncate text-[13px] tracking-tight transition-all duration-500 flex items-center gap-1.5 ${
                  isActive ? 'font-bold text-accent' : 'font-medium text-text-secondary group-hover:text-text'
                }`}>
                  <span className="truncate">{title}</span>
                  {isStreaming && (
                    <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse flex-shrink-0 shadow-[0_0_6px_rgba(var(--color-accent-rgb),0.5)]" />
                  )}
                </p>
                {sessionBadge && (
                  <div className="mt-1 flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] ${
                      isPlatformSession
                        ? 'border-accent/20 bg-accent/10 text-accent'
                        : 'border-border-light bg-surface-secondary/70 text-text-tertiary'
                    }`}>
                      {sessionBadge}
                    </span>
                    {session.readOnly && (
                      <span className="inline-flex items-center rounded-full border border-border-light bg-surface-secondary/70 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] text-text-tertiary">
                        {t('chat.session.readOnly')}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {confirmDeleteSessionId === session.id ? (
                <div className="flex shrink-0 items-center gap-1">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={(e) => handleConfirmDelete(e, session.id)}
                    onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation()
                        handleConfirmDelete(e as unknown as MouseEvent, session.id)
                      }
                    }}
                    className="rounded-md bg-red-500 px-2 py-1 text-[10px] font-black text-white transition-all duration-300 hover:bg-red-600 cursor-pointer"
                  >
                    {t('common.confirm')}
                  </div>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={handleCancelDelete}
                    onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation()
                        handleCancelDelete(e as unknown as MouseEvent)
                      }
                    }}
                    className="rounded-md bg-white/75 px-2 py-1 text-[10px] font-black text-text-tertiary transition-all duration-300 hover:text-text dark:bg-white/10 cursor-pointer"
                  >
                    {t('common.cancel')}
                  </div>
                </div>
              ) : (
                <div
                  onClick={(e) => handleDelete(e, session.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Delete "${title}"`}
                  onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation()
                      handleDelete(e as unknown as MouseEvent, session.id)
                    }
                  }}
                  className={`cursor-pointer rounded-md p-1 transition-all duration-300 ${
                    isActive
                      ? 'text-accent/60 hover:text-red-500 hover:bg-red-500/10'
                      : 'text-text-quaternary hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <Trash2 size={12} strokeWidth={1.5} />
                </div>
              )}

              {isActive && (
                <div className="absolute left-0 top-2 bottom-2 z-20 w-1 rounded-r-full bg-accent shadow-[2px_0_8px_rgba(var(--color-accent-rgb),0.3)]" />
              )}
            </button>
          )
          })}
        </div>
      ) : collapsed ? (
        /* ── Collapsed + Files: nothing to show, just a spacer ── */
        <div className="flex-1" />
      ) : (
        <div className="flex flex-1 min-h-0 flex-col px-3 pb-3">
          {/* ── Path bar ── */}
          <div className="mb-2">
            <div className="flex items-center gap-1 rounded-xl border border-border-light/60 bg-white/55 px-2.5 py-1.5 shadow-xs backdrop-blur-sm transition-all duration-200 hover:border-border-hover dark:bg-white/[0.04]">
              <FolderOpen size={11} strokeWidth={2.2} className="shrink-0 text-accent/60" />
              <div className="min-w-0 flex-1 truncate text-[11px] font-medium tracking-tight text-text-secondary" title={workspaceDir || t('sidebar.noWorkspace')}>
                {workspaceDir
                  ? (workspaceDir.split(/[/\\]/).filter(Boolean).pop() || workspaceDir)
                  : t('sidebar.noWorkspace')}
              </div>
              <div className="flex items-center gap-0.5">
                {/* Refresh directory */}
                <button
                  onClick={() => { useAppStore.getState().incrementFileTreeVersion() }}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-text-quaternary transition-all duration-200 hover:bg-accent/10 hover:text-accent"
                  title={t('sidebar.refreshDirectory')}
                >
                  <RotateCcw size={11} strokeWidth={2.2} />
                </button>
                {/* Switch workspace */}
                <button
                  onClick={handleSelectDir}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-text-quaternary transition-all duration-200 hover:bg-accent/10 hover:text-accent"
                  title={t('sidebar.switchWorkspace')}
                >
                  <RefreshCw size={11} strokeWidth={2.2} />
                </button>
                {/* Clear workspace */}
                <button
                  onClick={handleClearWorkspace}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-text-quaternary transition-all duration-200 hover:bg-red-500/10 hover:text-red-500"
                  title={t('sidebar.resetWorkspace')}
                >
                  <X size={11} strokeWidth={2.2} />
                </button>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden rounded-[22px] border border-border-light/70 bg-white/68 shadow-sm backdrop-blur-xl dark:bg-white/5">
            {workspaceDir ? (
              <div className="h-full overflow-y-auto px-2 py-2 scrollbar-subtle">
                <FileTree rootPath={normalizedWorkspaceDir} key={fileTreeVersion} />
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-5 text-center">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                  <FolderTree size={18} strokeWidth={2.1} />
                </div>
                <h3 className="text-[15px] font-black tracking-tight text-text">
                  {t('sidebar.filesEmptyTitle')}
                </h3>
                <p className="mt-2 max-w-[180px] text-[11px] leading-relaxed text-text-tertiary">
                  {t('sidebar.filesEmptyDesc')}
                </p>
                <button
                  onClick={handleSelectDir}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[11px] font-black text-white"
                >
                  <FolderOpen size={13} strokeWidth={2.2} />
                  {t('sidebar.pickWorkspace')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="p-4 pb-6 relative z-10 flex flex-col">
        <div className="absolute inset-x-4 top-0 h-px bg-linear-to-r from-transparent via-border-light to-transparent opacity-50" />
        
        <div className="flex flex-col gap-6 mt-4">
          <NavItem
            icon={Clock}
            label={t('sidebar.tasks')}
            active={currentPage === 'tasks'}
            onClick={() => onNavigate('tasks')}
            collapsed={collapsed}
          />
          <NavItem
            icon={Target}
            label={t('sidebar.goals')}
            active={currentPage === 'goal'}
            onClick={() => onNavigate('goal')}
            collapsed={collapsed}
          />
          <NavItem
            icon={Send}
            label={t('sidebar.platformHub')}
            active={currentPage === 'platforms'}
            onClick={() => onNavigate('platforms')}
            collapsed={collapsed}
          />
          <NavItem
            icon={PawPrint}
            label={t('sidebar.pet')}
            active={currentPage === 'pet'}
            onClick={() => onNavigate('pet')}
            collapsed={collapsed}
          />
          <NavItem
            icon={Puzzle}
            label={t('sidebar.extensions')}
            active={currentPage === 'extensions'}
            onClick={() => onNavigate('extensions')}
            collapsed={collapsed}
          />
        </div>

      {/* Theme & Settings Buttons */}
      <div className="mt-4 flex gap-2">
        <motion.button
          whileHover={{ scale: 1.02, y: -1 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          className={`flex items-center justify-center rounded-lg bg-surface-secondary/60 hover:bg-accent/5 text-text-tertiary hover:text-accent transition-all duration-500 border border-transparent hover:border-accent/10 shadow-xs ${
            collapsed ? 'w-full h-9' : 'flex-1 h-9'
          }`}
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </motion.button>
        {!collapsed && (
          <motion.button
            whileHover={{ scale: 1.02, y: -1 }}
            whileTap={{ scale: 0.98 }}
            onClick={onSettingsOpen}
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-surface-secondary/60 hover:bg-surface-tertiary text-text-tertiary hover:text-text transition-all duration-500 border border-transparent hover:border-black/5 dark:hover:border-white/5 shadow-xs"
          >
            <Settings size={16} />
          </motion.button>
        )}
      </div>
    </div>
  </aside>
)
}

interface NavItemProps {
icon: LucideIcon
label: string
active: boolean
onClick: () => void
collapsed: boolean
badge?: boolean
}

function NavItem({ icon: Icon, label, active, onClick, collapsed, badge }: NavItemProps) {
return (
  <motion.button
    whileHover={{ scale: 1.02, x: 3 }}
    whileTap={{ scale: 0.98 }}
    onClick={onClick}
    className={`flex items-center gap-3 rounded-lg transition-all duration-500 w-full relative group/nav ${
      active
        ? 'bg-white dark:bg-white/10 text-accent shadow-lg shadow-accent/5 ring-1 ring-accent/10'
        : 'hover:bg-white/40 dark:hover:bg-white/5 text-text-tertiary hover:text-text'
    } ${collapsed ? 'h-10 w-10 justify-center mx-auto' : 'px-4 py-2.5'}`}
  >
    <div className={`relative transition-transform duration-700 ${active ? 'scale-110' : 'group-hover/nav:scale-110'}`}>
      <Icon 
        size={collapsed ? 18 : 16} 
        strokeWidth={active ? 2.5 : 2} 
      />
      {badge && !active && (
        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-accent ring-2 ring-surface-secondary shadow-[0_0_10px_rgba(var(--color-accent-rgb),0.6)] animate-pulse" />
      )}
    </div>
    
    {!collapsed && (
      <span className={`text-[13px] tracking-tight transition-all duration-500 ${active ? 'font-black' : 'font-bold'}`}>
        {label}
      </span>
    )}

      {active && (
        <motion.div
          layoutId="activeNavIndicator"
          className="absolute right-4 w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_10px_rgba(var(--color-accent-rgb),0.8)]"
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      )}
    </motion.button>
  )
}
