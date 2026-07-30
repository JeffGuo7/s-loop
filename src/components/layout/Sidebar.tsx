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
      className={`h-full flex flex-col bg-surface-secondary/45 sidebar-transition shrink-0 z-20 relative group/sidebar ${className}`}
      style={{ width }}
    >
      <div className="px-3 pt-4 pb-3 relative z-10">
        {!collapsed ? (
          <div className="space-y-3">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <MagicButton
                onClick={handleNewChat}
                className="w-full h-10 gap-2 rounded-lg px-3 shadow-none group"
              >
                <Plus size={15} strokeWidth={2.2} />
                <span className="font-semibold text-[13px]">{t('sidebar.newChat')}</span>
              </MagicButton>
            </motion.div>

            <div className="space-y-2">
              <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-0.5">
                <button
                  onClick={() => setLeftPanelMode('sessions')}
                  className={`flex-1 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors duration-150 ${
                    !isFilesMode
                      ? 'bg-accent-subtle text-accent'
                      : 'text-text-tertiary hover:text-text hover:bg-surface-secondary'
                  }`}
                >
                  <span className="flex items-center justify-center gap-2">
                    <MessagesSquare size={12} />
                    {t('sidebar.panelSessions')}
                  </span>
                </button>
                <button
                  onClick={() => setLeftPanelMode('files')}
                  className={`flex-1 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors duration-150 ${
                    isFilesMode
                      ? 'bg-accent-subtle text-accent'
                      : 'text-text-tertiary hover:text-text hover:bg-surface-secondary'
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
                  <div className="section-eyebrow">
                    {isFilesMode ? t('sidebar.fileWorkspace') : t('sidebar.workspace')}
                  </div>
                  <div className="mt-0.5 text-[12px] font-semibold text-text">
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
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface text-text-tertiary transition-colors duration-150 hover:text-accent"
                    title={t('sidebar.collapseTitle')}
                  >
                    <ChevronLeft size={14} strokeWidth={2.5} />
                  </motion.button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 w-full items-center pt-1">
            <motion.div>
              <MagicButton
                onClick={handleNewChat}
                className="w-9 h-9 rounded-lg shadow-none"
              >
                <Plus size={18} strokeWidth={2.3} className="text-white" />
              </MagicButton>
            </motion.div>
            <button
              onClick={() => setLeftPanelMode(isFilesMode ? 'sessions' : 'files')}
              className={`w-9 h-9 rounded-lg border transition-colors duration-150 flex items-center justify-center ${
                isFilesMode
                  ? 'bg-accent-subtle text-accent border-accent/20'
                  : 'bg-surface text-text-tertiary border-border hover:text-accent'
              }`}
              title={isFilesMode ? t('sidebar.backToSessions') : t('sidebar.openFileTree')}
            >
              {isFilesMode ? <MessagesSquare size={17} strokeWidth={2.4} /> : <FolderTree size={17} strokeWidth={2.4} />}
            </button>
            <motion.button
              whileHover={{ scale: 1.05, x: 2 }}
              whileTap={{ scale: 0.95 }}
              onClick={onToggleCollapse}
              className="w-8 h-8 flex items-center justify-center rounded-md bg-surface text-text-tertiary hover:text-accent transition-colors duration-150 border border-border"
              title={t('sidebar.expandTitle')}
            >
              <ChevronRight size={16} strokeWidth={2.5} />
            </motion.button>
          </div>
        )}
      </div>

      {!isFilesMode ? (
        <div className="flex-1 overflow-y-auto px-3 pb-3 pt-1 scrollbar-subtle space-y-0.5">
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
                className={`group relative w-full h-9 rounded-md transition-colors duration-150 flex items-center justify-center border ${
                  isActive
                    ? 'bg-accent-subtle border-accent/20 cursor-default'
                    : 'bg-transparent border-transparent hover:bg-surface cursor-pointer'
                }`}
              >
                <div className={`flex items-center justify-center w-6 h-6 rounded-md transition-colors duration-150 ${
                  isActive ? 'text-accent' : 'text-text-quaternary group-hover:text-text-secondary'
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
                  <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-accent rounded-r-full z-20" />
                )}
              </button>
            )
          }

          return (
            <button
              key={session.id}
              onClick={() => handleSelect(session.id)}
              className={`group relative flex w-full min-h-[40px] items-center gap-2.5 rounded-md border pl-3 pr-8 py-1.5 transition-colors duration-150 ${
                isActive
                  ? 'bg-accent-subtle border-accent/20 cursor-default'
                  : 'bg-transparent border-transparent hover:bg-surface cursor-pointer'
              }`}
            >
              <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors duration-150 ${
                isActive ? 'text-accent' : 'text-text-quaternary group-hover:text-text-secondary'
              }`}>
                <MessageSquare size={13} strokeWidth={isActive ? 2.5 : 1.5} />
              </div>

              <div className="min-w-0 flex-1 text-left">
                <p className={`truncate text-[12px] transition-colors duration-150 flex items-center gap-1.5 ${
                  isActive ? 'font-semibold text-text' : 'font-medium text-text-secondary group-hover:text-text'
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
                <div className="absolute left-0 top-1.5 bottom-1.5 z-20 w-0.5 rounded-r-full bg-accent" />
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

          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-surface">
            {workspaceDir ? (
              <div className="h-full overflow-y-auto px-2 py-2 scrollbar-subtle">
                <FileTree rootPath={normalizedWorkspaceDir} key={fileTreeVersion} />
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center px-5 text-center">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-accent-subtle text-accent">
                  <FolderTree size={18} strokeWidth={2.1} />
                </div>
                <h3 className="text-[14px] font-semibold text-text">
                  {t('sidebar.filesEmptyTitle')}
                </h3>
                <p className="mt-2 max-w-[180px] text-[11px] leading-relaxed text-text-tertiary">
                  {t('sidebar.filesEmptyDesc')}
                </p>
                <button
                  onClick={handleSelectDir}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[11px] font-semibold text-white"
                >
                  <FolderOpen size={13} strokeWidth={2.2} />
                  {t('sidebar.pickWorkspace')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="p-3 pb-4 relative z-10 flex flex-col">
        <div className="absolute inset-x-4 top-0 h-px bg-linear-to-r from-transparent via-border-light to-transparent opacity-50" />
        
        <div className="flex flex-col gap-1 mt-3">
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
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          className={`flex items-center justify-center rounded-md bg-surface hover:bg-accent-subtle text-text-tertiary hover:text-accent transition-colors duration-150 border border-border ${
            collapsed ? 'w-full h-9' : 'flex-1 h-9'
          }`}
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </motion.button>
        {!collapsed && (
          <motion.button
            onClick={onSettingsOpen}
            className="flex items-center justify-center w-9 h-9 rounded-md bg-surface text-text-tertiary hover:text-text transition-colors duration-150 border border-border"
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
    onClick={onClick}
    className={`flex items-center gap-3 rounded-md transition-colors duration-150 w-full relative group/nav ${
      active
        ? 'bg-accent-subtle text-text'
        : 'hover:bg-surface text-text-tertiary hover:text-text'
    } ${collapsed ? 'h-9 w-9 justify-center mx-auto' : 'px-3 py-2'}`}
  >
    <div className={`relative ${active ? 'text-accent' : ''}`}>
      <Icon 
        size={collapsed ? 18 : 16} 
        strokeWidth={active ? 2.5 : 2} 
      />
      {badge && !active && (
        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-accent ring-2 ring-surface-secondary shadow-[0_0_10px_rgba(var(--color-accent-rgb),0.6)] animate-pulse" />
      )}
    </div>
    
    {!collapsed && (
      <span className={`text-[12px] transition-colors duration-150 ${active ? 'font-semibold' : 'font-medium'}`}>
        {label}
      </span>
    )}

      {active && (
        <motion.div
          layoutId="activeNavIndicator"
          className="absolute inset-y-1.5 left-0 w-0.5 rounded-r-full bg-accent"
          transition={{ type: "spring", stiffness: 360, damping: 36 }}
        />
      )}
    </motion.button>
  )
}
