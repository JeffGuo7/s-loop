import { useCallback } from 'react'
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
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { ListBox, ListBoxItem } from "@heroui/react"
import { useAppStore, usePetStore, useTelegramStore } from '../../stores'
import { MagicButton } from '../ui'
import type { Page } from '../../App'

interface SidebarProps {
  onSettingsOpen: () => void
  onPetOpen: () => void
  onTelegramOpen: () => void
  currentPage: Page
  onNavigate: (page: Page) => void
  collapsed?: boolean
  onToggleCollapse?: () => void
}

export function Sidebar({
  onSettingsOpen,
  onPetOpen,
  onTelegramOpen,
  currentPage,
  onNavigate,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const sessions = useAppStore((s) => s.sessions)
  const activeSessionId = useAppStore((s) => s.activeSessionId)
  const setActiveSession = useAppStore((s) => s.setActiveSession)
  const createSession = useAppStore((s) => s.createSession)
  const deleteSession = useAppStore((s) => s.deleteSession)
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const { pet, showPet } = usePetStore()
  const { isConnected } = useTelegramStore()

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

  const width = collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)'

  return (
    <aside
      className="h-full flex flex-col bg-surface/30 backdrop-blur-3xl sidebar-transition shrink-0 z-20 relative group/sidebar"
      style={{ width }}
    >
      {/* Dynamic Accent Background Layer */}
      <div className="absolute inset-0 bg-linear-to-b from-accent/3 via-transparent to-accent/2 pointer-events-none opacity-50" />
      
      {/* Right Edge Glow Indicator */}
      <div className="absolute inset-y-0 right-0 w-px bg-linear-to-b from-transparent via-accent/15 to-transparent shadow-[0_0_15px_rgba(var(--color-accent-rgb),0.1)]" />

      {/* Header: New Chat & Title */}
      <div className="px-6 pt-12 pb-10 relative z-10">
        {!collapsed ? (
          <div className="space-y-12">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              <MagicButton
                onClick={handleNewChat}
                className="w-full gap-4 rounded-xl py-6.5 shadow-lg shadow-accent/10 group relative overflow-hidden transition-all duration-500 hover:shadow-accent/20 hover:scale-[1.01] active:scale-98"
              >
                <div className="absolute inset-0 bg-linear-to-tr from-white/10 via-transparent to-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                <div className="relative z-10 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center backdrop-blur-md group-hover:rotate-6 transition-transform duration-500">
                    <Plus size={20} strokeWidth={2.5} className="text-white" />
                  </div>
                  <span className="font-bold tracking-tight text-base text-white">New Chat</span>
                </div>
              </MagicButton>
            </motion.div>

            <div className="flex items-center justify-between px-2">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black uppercase tracking-[0.25em] text-accent opacity-50">
                  Workspace
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-bold text-text tracking-tight">
                    Recent Activity
                  </span>
                  <button
                    onClick={() => {
                      if (window.confirm('Clear all conversations?')) {
                        useAppStore.getState().clearSessions()
                      }
                    }}
                    className="p-1 rounded-md text-text-quaternary hover:text-red-500 hover:bg-red-500/10 transition-all duration-300 group/clear"
                    title="Clear all sessions"
                  >
                    <Trash2 size={12} strokeWidth={2} className="group-hover/clear:scale-110 transition-transform" />
                  </button>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.05, x: -2 }}
                whileTap={{ scale: 0.95 }}
                onClick={onToggleCollapse}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-secondary/80 text-text-tertiary hover:text-accent transition-all duration-300 shadow-sm border border-black/5 dark:border-white/5"
                title="Collapse sidebar"
              >
                <ChevronLeft size={16} strokeWidth={2.5} />
              </motion.button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-8 w-full items-center pt-2">
            <motion.div whileHover={{ scale: 1.15, rotate: 10 }} whileTap={{ scale: 0.9 }}>
              <MagicButton
                onClick={handleNewChat}
                className="w-14 h-14 rounded-2xl shadow-xl shadow-accent/20"
              >
                <Plus size={28} strokeWidth={3} className="text-white" />
              </MagicButton>
            </motion.div>
            <motion.button
              whileHover={{ scale: 1.05, x: 2 }}
              whileTap={{ scale: 0.95 }}
              onClick={onToggleCollapse}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-surface-secondary/80 text-text-tertiary hover:text-accent transition-all duration-300 shadow-md border border-black/5 dark:border-white/5"
              title="Expand sidebar"
            >
              <ChevronRight size={18} strokeWidth={2.5} />
            </motion.button>
          </div>
        )}
      </div>

      {/* Main Content: Session list */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 pt-1 scrollbar-subtle space-y-2">
        <ListBox
          aria-label="Chat Sessions"
          items={sessions}
          onAction={(key: React.Key) => handleSelect(key as string)}
          selectedKeys={activeSessionId ? [activeSessionId] : []}
          className="p-0 gap-2"
        >
          {(session: any) => {
            const isActive = session.id === activeSessionId
            const title = session.title || 'Untitled Chat'

            return (
              <ListBoxItem
                key={session.id}
                id={session.id}
                textValue={title}
                className={`group relative min-h-[48px] rounded-xl transition-all duration-500 mb-1.5 overflow-hidden border ${
                  isActive 
                    ? 'bg-white dark:bg-white/10 border-accent/25 shadow-md ring-1 ring-accent/5' 
                    : 'bg-transparent border-transparent hover:bg-surface-secondary/80 hover:border-black/5 dark:hover:border-white/5'
                }`}
              >
                <div className={`flex items-center gap-4 w-full pl-5 pr-12 py-3 ${collapsed ? 'justify-center' : ''}`}>
                  {/* Icon - Refined */}
                  <div className={`flex items-center justify-center w-7 h-7 shrink-0 rounded-lg transition-all duration-500 ${
                    isActive ? 'bg-accent/10 text-accent' : 'bg-surface-tertiary/40 text-text-quaternary group-hover:text-text-secondary'
                  }`}>
                    <MessageSquare size={15} strokeWidth={isActive ? 2.5 : 1.5} />
                  </div>

                  {!collapsed && (
                    <div className="flex-1 min-w-0 flex flex-col">
                      <span className={`text-[14px] truncate tracking-tight transition-all duration-500 ${
                        isActive ? 'font-bold text-text' : 'font-medium text-text-secondary group-hover:text-text'
                      }`}>
                        {title}
                      </span>
                    </div>
                  )}

                  {!collapsed && (
                    <motion.button
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(e, session.id);
                      }}
                      className="absolute right-4 p-1.5 rounded-lg text-text-quaternary hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all duration-300 backdrop-blur-sm bg-white/50 dark:bg-black/20 shadow-sm border border-black/5 dark:border-white/5"
                    >
                      <Trash2 size={14} strokeWidth={1.5} />
                    </motion.button>
                  )}
                </div>

                {/* Active Indicator Line - Subtle */}
                {isActive && (
                  <motion.div
                    layoutId="activeSessionBar"
                    className="absolute left-0 top-3 bottom-3 w-1 bg-accent rounded-r-full"
                    transition={{ type: "spring", stiffness: 400, damping: 40 }}
                  />
                )}
              </ListBoxItem>
            )
          }}
        </ListBox>
      </div>

      {/* Footer: Utilities */}
      <div className="p-8 relative z-10">
        <div className="absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent via-border-light to-transparent" />
        
        <div className="space-y-4">
          <NavItem
            icon={Clock}
            label="Daily Tasks"
            active={currentPage === 'tasks'}
            onClick={() => onNavigate('tasks')}
            collapsed={collapsed}
          />
          <NavItem
            icon={Send}
            label="Telegram Hub"
            active={isConnected}
            onClick={onTelegramOpen}
            collapsed={collapsed}
            badge={isConnected}
          />
          <NavItem
            icon={PawPrint}
            label={pet ? (showPet ? 'Sleep Mode' : 'Wake Pet') : 'Hatch Pet'}
            active={showPet && !!pet}
            onClick={onPetOpen}
            collapsed={collapsed}
          />
        </div>

        <div className="mt-6 flex gap-3">
          <motion.button
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className={`flex items-center justify-center rounded-xl bg-surface-secondary/60 hover:bg-accent/5 text-text-tertiary hover:text-accent transition-all duration-500 border border-transparent hover:border-accent/10 shadow-xs ${
              collapsed ? 'w-full h-12' : 'flex-1 h-12'
            }`}
          >
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </motion.button>
          {!collapsed && (
            <motion.button
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={onSettingsOpen}
              className="flex items-center justify-center w-12 h-12 rounded-xl bg-surface-secondary/60 hover:bg-surface-tertiary text-text-tertiary hover:text-text transition-all duration-500 border border-transparent hover:border-black/5 dark:hover:border-white/5 shadow-xs"
            >
              <Settings size={20} />
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
      whileHover={{ scale: 1.02, x: 4 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`flex items-center gap-5 rounded-2xl transition-all duration-500 w-full relative group/nav ${
        active
          ? 'bg-white dark:bg-white/10 text-accent shadow-xl shadow-accent/5 ring-1 ring-accent/10'
          : 'hover:bg-white/40 dark:hover:bg-white/5 text-text-tertiary hover:text-text'
      } ${collapsed ? 'h-14 w-14 justify-center mx-auto' : 'px-6 py-4.5'}`}
    >
      <div className={`relative transition-transform duration-700 ${active ? 'scale-110' : 'group-hover/nav:scale-110'}`}>
        <Icon 
          size={collapsed ? 24 : 22} 
          strokeWidth={active ? 2.5 : 2} 
        />
        {badge && !active && (
          <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-green-500 ring-4 ring-surface-secondary shadow-[0_0_15px_rgba(34,197,94,0.6)] animate-pulse" />
        )}
      </div>
      
      {!collapsed && (
        <span className={`text-[15px] tracking-tight transition-all duration-500 ${active ? 'font-black' : 'font-bold'}`}>
          {label}
        </span>
      )}

      {active && (
        <motion.div
          layoutId="activeNavIndicator"
          className="absolute right-5 w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_12px_rgba(var(--color-accent-rgb),0.8)]"
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      )}
    </motion.button>
  )
}
