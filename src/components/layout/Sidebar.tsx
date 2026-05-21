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
  type LucideIcon,
} from 'lucide-react'
import { motion } from 'framer-motion'
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

  const width = collapsed ? 'var(--spacing-sidebar-collapsed)' : 'var(--spacing-sidebar)'

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
                className="w-full gap-2.5 rounded-lg py-3.5 shadow-lg shadow-accent/10 group relative overflow-hidden transition-all duration-500 hover:shadow-accent/20 hover:scale-[1.01] active:scale-98"
              >
                <div className="absolute inset-0 bg-linear-to-tr from-white/10 via-transparent to-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                <div className="relative z-10 flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-md bg-white/15 flex items-center justify-center backdrop-blur-md group-hover:rotate-6 transition-transform duration-500">
                    <Plus size={16} strokeWidth={2.5} className="text-white" />
                  </div>
                  <span className="font-bold tracking-tight text-[14px] text-white">New Chat</span>
                </div>
              </MagicButton>
            </motion.div>

            <div className="flex items-center justify-between px-1">
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-accent opacity-50">
                  Workspace
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-bold text-text tracking-tight">
                    Recent
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
                    <Trash2 size={11} strokeWidth={2} className="group-hover/clear:scale-110 transition-transform" />
                  </button>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.05, x: -2 }}
                whileTap={{ scale: 0.95 }}
                onClick={onToggleCollapse}
                className="w-7 h-7 flex items-center justify-center rounded-md bg-surface-secondary/80 text-text-tertiary hover:text-accent transition-all duration-300 shadow-sm border border-black/5 dark:border-white/5"
                title="Collapse sidebar"
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
              title="Expand sidebar"
            >
              <ChevronRight size={16} strokeWidth={2.5} />
            </motion.button>
          </div>
        )}
      </div>

      {/* Main Content: Session list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-1 scrollbar-subtle space-y-1.5">
        <ListBox
          aria-label="Chat Sessions"
          items={sessions}
          onAction={(key: React.Key) => handleSelect(key as string)}
          selectedKeys={activeSessionId ? [activeSessionId] : []}
          className="p-0 gap-1.5"
        >
          {(session: any) => {
            const isActive = session.id === activeSessionId
            const title = session.title || 'Untitled Chat'

            return (
              <ListBoxItem
                key={session.id}
                id={session.id}
                textValue={title}
                className={`group relative min-h-[40px] rounded-lg transition-all duration-500 mb-1 overflow-hidden border ${
                  isActive 
                    ? 'bg-white dark:bg-white/10 border-accent/20 shadow-sm ring-1 ring-accent/5' 
                    : 'bg-transparent border-transparent hover:bg-surface-secondary/70 hover:border-black/5 dark:hover:border-white/5'
                }`}
              >
                <div className={`flex items-center gap-2.5 w-full pl-3 pr-8 py-2 ${collapsed ? 'justify-center' : ''}`}>
                  {/* Icon - Refined */}
                  <div className={`flex items-center justify-center w-6 h-6 shrink-0 rounded-md transition-all duration-500 ${
                    isActive ? 'bg-accent/10 text-accent' : 'bg-surface-tertiary/40 text-text-quaternary group-hover:text-text-secondary'
                  }`}>
                    <MessageSquare size={13} strokeWidth={isActive ? 2.5 : 1.5} />
                  </div>

                  {!collapsed && (
                    <div className="flex-1 min-w-0 flex flex-col">
                      <span className={`text-[13px] truncate tracking-tight transition-all duration-500 ${
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
                      className="absolute right-3 p-1 rounded-md text-text-quaternary hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all duration-300 backdrop-blur-sm bg-white/50 dark:bg-black/20 shadow-sm border border-black/5 dark:border-white/5"
                    >
                      <Trash2 size={12} strokeWidth={1.5} />
                    </motion.button>
                  )}
                </div>

                {/* Active Indicator Line - Subtle */}
                {isActive && (
                  <motion.div
                    layoutId="activeSessionBar"
                    className="absolute left-0 top-2.5 bottom-2.5 w-0.5 bg-accent rounded-r-full"
                    transition={{ type: "spring", stiffness: 400, damping: 40 }}
                  />
                )}
              </ListBoxItem>
            )
          }}
        </ListBox>
      </div>

      {/* Footer: Utilities */}
      <div className="p-4 pb-6 relative z-10 flex flex-col">
        <div className="absolute inset-x-4 top-0 h-px bg-linear-to-r from-transparent via-border-light to-transparent opacity-50" />
        
        <div className="flex flex-col gap-6 mt-4">
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
            label={pet ? (showPet ? 'Sleep' : 'Wake Pet') : 'Hatch'}
            active={showPet && !!pet}
            onClick={onPetOpen}
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
