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

  const width = collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)'

  return (
    <aside
      className="h-full flex flex-col bg-surface/40 backdrop-blur-3xl sidebar-transition shrink-0 z-20 relative"
      style={{ width }}
    >
      {/* Subtle blend shadow instead of hard border */}
      <div className="absolute inset-y-0 right-0 w-px bg-linear-to-b from-transparent via-black/[0.03] dark:via-white/[0.05] to-transparent" />
      {/* Top Actions */}
      <div className="px-6 pt-12 pb-6">
        {!collapsed && (
          <>
            <motion.div
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
            >
              <MagicButton
                onClick={handleNewChat}
                className="w-full gap-3 rounded-2xl shadow-xl shadow-accent/10 py-8 group relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-linear-to-tr from-white/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <Plus size={22} strokeWidth={3} />
                <span className="font-extrabold tracking-tight text-lg">New Chat</span>
              </MagicButton>
            </motion.div>
            
            <div className="mt-12 flex items-center justify-between px-2">
              <span className="text-[12px] font-bold uppercase tracking-[0.3em] text-text-tertiary opacity-50">
                Recent Conversations
              </span>
              <button
                onClick={onToggleCollapse}
                className="p-2 rounded-xl hover:bg-surface-secondary text-text-tertiary transition-all hover:text-text-secondary"
                title="Collapse sidebar"
              >
                <ChevronLeft size={16} />
              </button>
            </div>
          </>
        )}
        {collapsed && (
          <div className="flex flex-col gap-6 w-full items-center pt-2">
            <motion.div
              whileHover={{ scale: 1.1, rotate: 5 }}
              whileTap={{ scale: 0.9 }}
            >
              <MagicButton
                onClick={handleNewChat}
                className="w-14 h-14 rounded-2xl shadow-xl shadow-accent/10"
              >
                <Plus size={28} strokeWidth={3} />
              </MagicButton>
            </motion.div>
            <button
              onClick={onToggleCollapse}
              className="p-2.5 rounded-xl hover:bg-surface-secondary text-text-tertiary transition-all"
              title="Expand sidebar"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        )}
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4 scrollbar-subtle">
        <ListBox
          aria-label="Chat Sessions"
          items={sessions}
          onAction={(key: React.Key) => handleSelect(key as string)}
          selectedKeys={activeSessionId ? [activeSessionId] : []}
          className="p-0"
        >
          {(session: any) => {
            const isActive = session.id === activeSessionId
            const title = session.title || 'New Chat'

            return (
              <ListBoxItem
                key={session.id}
                id={session.id}
                textValue={title}
                className={`group relative h-16 rounded-[24px] transition-all duration-500 mb-4 ${
                  isActive 
                    ? 'bg-accent-muted text-accent shadow-sm ring-1 ring-accent/20' 
                    : 'text-text-secondary hover:bg-surface-secondary/80'
                }`}
              >
                <div className="flex items-center gap-5 w-full px-3">
                  <div className="flex items-center justify-center w-8 h-8 shrink-0">
                    <MessageSquare
                      size={20}
                      strokeWidth={isActive ? 2.5 : 1.5}
                      className={isActive ? 'text-accent' : 'text-text-quaternary group-hover:text-text-secondary'}
                    />
                  </div>
                  {!collapsed ? (
                    <span className={`text-[16px] truncate tracking-tight flex-1 ${isActive ? 'font-bold' : 'font-medium'}`}>
                      {title}
                    </span>
                  ) : null}
                  {!collapsed ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(e, session.id);
                      }}
                      className="p-2.5 rounded-xl text-text-quaternary hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all scale-90 hover:scale-100"
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : null}
                </div>
              </ListBoxItem>
            )
          }}
        </ListBox>
      </div>

      {/* Footer */}
      <div className="p-8 space-y-8 border-t border-black/4 dark:border-white/4">
        <div className="bg-surface-secondary/60 rounded-[32px] p-2 border border-black/3 dark:border-white/3 space-y-2">
          <NavItem
            icon={Clock}
            label="Tasks"
            active={currentPage === 'tasks'}
            onClick={() => onNavigate('tasks')}
            collapsed={collapsed}
          />
          <NavItem
            icon={Send}
            label="Telegram"
            active={isConnected}
            onClick={onTelegramOpen}
            collapsed={collapsed}
            badge={isConnected}
          />
          <NavItem
            icon={PawPrint}
            label={pet ? (showPet ? 'Hide Pet' : 'Show Pet') : 'Hatch Pet'}
            active={showPet && !!pet}
            onClick={onPetOpen}
            collapsed={collapsed}
          />
        </div>

        <div className="flex gap-4">
          <motion.button
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className={`flex items-center justify-center rounded-[20px] hover:bg-surface-hover text-text-tertiary hover:text-accent transition-all border border-transparent hover:border-accent/20 ${
              collapsed ? 'w-full h-16' : 'flex-1 h-16'
            }`}
            title={theme === 'light' ? 'Dark mode' : 'Light mode'}
          >
            {theme === 'light' ? <Moon size={22} /> : <Sun size={22} />}
          </motion.button>
          {!collapsed && (
            <motion.button
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
              onClick={onSettingsOpen}
              className="flex items-center justify-center w-16 h-16 rounded-[20px] hover:bg-surface-hover text-text-tertiary hover:text-text-secondary transition-all border border-transparent hover:border-black/[0.1]"
              title="Settings"
            >
              <Settings size={22} />
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
    <button
      onClick={onClick}
      className={`flex items-center gap-4 rounded-[22px] transition-all duration-500 w-full relative group ${
        active
          ? 'bg-white dark:bg-white/10 text-accent shadow-[0_8px_32px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.03] dark:ring-white/[0.05]'
          : 'hover:bg-surface-hover/80 text-text-tertiary hover:text-text-secondary'
      } ${collapsed ? 'aspect-square justify-center' : 'px-5 py-3.5'}`}
      title={label}
    >
      <Icon 
        size={20} 
        strokeWidth={active ? 2.5 : 1.5} 
        className={`transition-transform duration-500 ${active ? 'scale-110' : 'group-hover:scale-110'}`}
      />
      {!collapsed && <span className="text-[15px] font-bold tracking-tight">{label}</span>}
      {badge && !active && (
        <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-green-500 ring-4 ring-surface-secondary animate-pulse shadow-[0_0_12px_rgba(34,197,94,0.4)]" />
      )}
      {active && (
        <motion.div
          layoutId="activeNavIndicator"
          className="absolute left-1.5 w-1 h-6 bg-accent rounded-full shadow-[0_0_12px_rgba(var(--color-accent-rgb),0.4)]"
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      )}
    </button>
  )
}
