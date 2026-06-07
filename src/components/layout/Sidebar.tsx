import { useCallback } from 'react'
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
  type LucideIcon,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { useAppStore } from '../../stores'
import { MagicButton } from '../ui'
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
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const createSession = useAppStore((s) => s.createSession)
  const deleteSession = useAppStore((s) => s.deleteSession)
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

  const handleDelete = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation()
      deleteSession(id)
    },
    [deleteSession],
  )

  const width = collapsed ? 'var(--spacing-sidebar-collapsed)' : 'var(--spacing-sidebar)'

  return (
    <aside
      className={`h-full flex flex-col bg-transparent sidebar-transition shrink-0 z-20 relative group/sidebar ${className}`}
      style={{ width }}
    >
      {/* Background Layer - Removed for consistency */}
      
      {/* Right Edge - No indicator line to keep it seamless */}

      {/* Header: New Chat & Title */}
      <div className="px-4 pt-8 pb-6 relative z-10">
        {!collapsed ? (
          <div className="space-y-8">
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

            <div className="flex items-center justify-between px-1">
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-accent opacity-50">
                  {t('sidebar.workspace')}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-bold text-text tracking-tight">
                    {t('sidebar.recent')}
                  </span>
                  <button
                    onClick={() => {
                      if (window.confirm(t('sidebar.clearConfirm'))) {
                        useAppStore.getState().clearSessions()
                      }
                    }}
                    className="p-1 rounded-md text-text-quaternary hover:text-red-500 hover:bg-red-500/10 transition-all duration-300 group/clear"
                    title={t('sidebar.clearTitle')}
                  >
                    <Trash2 size={11} strokeWidth={2} className="group-hover/clear:scale-110 transition-transform" />
                  </button>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.05, x: -2 }}
                whileTap={{ scale: 0.95 }}
                onClick={onToggleCollapse}
                className="w-7 h-7 flex items-center justify-center rounded-md bg-surface-secondary/80 text-text-tertiary hover:text-accent transition-all duration-300 shadow-sm border border-black/5 dark:border-white/5"
                title={t('sidebar.collapseTitle')}
              >
                <ChevronLeft size={14} strokeWidth={2.5} />
              </motion.button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6 w-full items-center pt-2">
            <motion.div whileHover={{ scale: 1.1, rotate: 10 }} whileTap={{ scale: 0.9 }}>
              <MagicButton
                onClick={handleNewChat}
                className="w-11 h-11 rounded-xl shadow-xl shadow-accent/20"
              >
                <Plus size={22} strokeWidth={3} className="text-white" />
              </MagicButton>
            </motion.div>
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

      {/* Main Content: Session list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-1 scrollbar-subtle space-y-1">
        {sessions.map((session) => {
          const isActive = session.id === activeSessionId
          const title = session.title || t('sidebar.untitled')

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
              className={`group relative w-full min-h-[44px] rounded-lg transition-all duration-500 flex items-center border pl-3 pr-8 py-2 gap-2.5 ${
                isActive
                  ? 'bg-accent/8 dark:bg-accent/15 border-accent/25 shadow-md ring-1 ring-accent/10 cursor-default'
                  : 'bg-transparent border-transparent hover:bg-surface-secondary/70 hover:border-black/5 dark:hover:border-white/5 cursor-pointer'
              }`}
            >
              <div className={`flex items-center justify-center w-6 h-6 shrink-0 rounded-md transition-all duration-500 ${
                isActive ? 'bg-accent/15 text-accent shadow-sm shadow-accent/10' : 'bg-surface-tertiary/40 text-text-quaternary group-hover:text-text-secondary'
              }`}>
                <MessageSquare size={13} strokeWidth={isActive ? 2.5 : 1.5} />
              </div>

              <div className="flex-1 min-w-0 text-left">
                <p className={`text-[13px] truncate tracking-tight transition-all duration-500 ${
                  isActive ? 'font-bold text-accent' : 'font-medium text-text-secondary group-hover:text-text'
                }`}>
                  {title}
                </p>
              </div>

              <div
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(e, session.id);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    handleDelete(e as unknown as React.MouseEvent, session.id);
                  }
                }}
                className={`p-1 rounded-md transition-all duration-300 cursor-pointer ${
                  isActive
                    ? 'text-accent/60 hover:text-red-500 hover:bg-red-500/10'
                    : 'text-text-quaternary hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100'
                }`}
              >
                <Trash2 size={12} strokeWidth={1.5} />
              </div>

              {/* Active Indicator Line */}
              {isActive && (
                <div className="absolute left-0 top-2 bottom-2 w-1 bg-accent rounded-r-full z-20 shadow-[2px_0_8px_rgba(var(--color-accent-rgb),0.3)]" />
              )}
            </button>
          )
        })}
      </div>

      {/* Footer: Utilities */}
      <div className="p-4 pb-6 relative z-10 flex flex-col">
        <div className="absolute inset-x-4 top-0 h-px bg-linear-to-r from-transparent via-border-light to-transparent opacity-50" />
        
        <div className="flex flex-col gap-6 mt-4">
          <NavItem
            icon={Clock}
            label={t('sidebar.dailyTasks')}
            active={currentPage === 'tasks'}
            onClick={() => onNavigate('tasks')}
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
        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-green-500 ring-2 ring-surface-secondary shadow-[0_0_10px_rgba(34,197,94,0.6)] animate-pulse" />
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
