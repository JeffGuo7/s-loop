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
      className="h-full flex flex-col bg-(--color-surface) border-r border-(--color-border) sidebar-transition shrink-0 z-20"
      style={{ width }}
    >
      {/* Top Actions */}
      <div className="px-4 pt-8 pb-4">
        {!collapsed && (
          <>
            <motion.div
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
            >
              <MagicButton
                onClick={handleNewChat}
                className="w-full gap-2 rounded-xl shadow-lg shadow-accent/15 py-6 group relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-linear-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <Plus size={18} strokeWidth={2.5} />
                <span className="font-bold tracking-tight">New Chat</span>
              </MagicButton>
            </motion.div>
            
            <div className="mt-8 flex items-center justify-between px-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-(--color-text-tertiary) opacity-60">
                Recent Conversations
              </span>
              <button
                onClick={onToggleCollapse}
                className="p-1.5 rounded-lg hover:bg-(--color-surface-secondary) text-(--color-text-tertiary) transition-all hover:text-(--color-text-secondary)"
                title="Collapse sidebar"
              >
                <ChevronLeft size={14} />
              </button>
            </div>
          </>
        )}
        {collapsed && (
          <div className="flex flex-col gap-4 w-full items-center pt-1">
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <MagicButton
                onClick={handleNewChat}
                className="w-12 h-12 rounded-xl shadow-lg shadow-accent/15"
              >
                <Plus size={22} strokeWidth={2.5} />
              </MagicButton>
            </motion.div>
            <button
              onClick={onToggleCollapse}
              className="p-2 rounded-lg hover:bg-(--color-surface-secondary) text-(--color-text-tertiary) transition-all"
              title="Expand sidebar"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 pt-2 scrollbar-subtle">
        <ListBox
          aria-label="Chat Sessions"
          items={sessions}
          onAction={(key) => handleSelect(key as string)}
          selectedKeys={activeSessionId ? [activeSessionId] : []}
          className="p-0"
        >
          {(session) => {
            const isActive = session.id === activeSessionId
            const title = session.title || 'New Chat'

            return (
              <ListBoxItem
                key={session.id}
                id={session.id}
                textValue={title}
                className={`group relative h-12 rounded-xl transition-all duration-300 ${
                  isActive 
                    ? 'bg-(--color-accent-muted) text-(--color-accent)' 
                    : 'text-(--color-text-secondary) hover:bg-(--color-surface-secondary)'
                }`}
              >
                <div className="flex items-center gap-3 w-full">
                  <MessageSquare
                    size={16}
                    strokeWidth={isActive ? 2.5 : 1.5}
                    className={isActive ? 'text-(--color-accent)' : 'text-(--color-text-quaternary) group-hover:text-(--color-text-secondary)'}
                  />
                  {!collapsed ? (
                    <span className={`text-sm truncate tracking-tight flex-1 ${isActive ? 'font-bold' : 'font-medium'}`}>
                      {title}
                    </span>
                  ) : null}
                  {!collapsed ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(e, session.id);
                      }}
                      className="p-1.5 rounded-lg text-(--color-text-quaternary) hover:text-(--color-error) hover:bg-(--color-error-bg) opacity-0 group-hover:opacity-100 transition-all scale-90 hover:scale-100"
                    >
                      <Trash2 size={13} />
                    </button>
                  ) : null}
                </div>
              </ListBoxItem>
            )
          }}
        </ListBox>
      </div>

      {/* Footer */}
      <div className="p-4 space-y-4 border-t border-black/[0.02] dark:border-white/[0.02]">
        <div className="bg-(--color-surface-secondary)/40 rounded-2xl p-1 border border-black/[0.02] dark:border-white/[0.02]">
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

        <div className="flex gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className={`flex items-center justify-center rounded-xl hover:bg-(--color-surface-hover) text-(--color-text-tertiary) hover:text-(--color-accent) transition-all border border-transparent hover:border-(--color-accent)/10 ${
              collapsed ? 'w-full h-11' : 'flex-1 h-11'
            }`}
            title={theme === 'light' ? 'Dark mode' : 'Light mode'}
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </motion.button>
          {!collapsed && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onSettingsOpen}
              className="flex items-center justify-center w-11 h-11 rounded-xl hover:bg-(--color-surface-hover) text-(--color-text-tertiary) hover:text-(--color-text-secondary) transition-all border border-transparent hover:border-black/[0.05]"
              title="Settings"
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
    <button
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl transition-all w-full relative group ${
        active
          ? 'bg-(--color-surface) text-(--color-accent) shadow-sm ring-1 ring-black/[0.02] dark:ring-white/[0.02]'
          : 'hover:bg-(--color-surface-hover)/60 text-(--color-text-tertiary) hover:text-(--color-text-secondary)'
      } ${collapsed ? 'aspect-square justify-center' : 'px-3.5 py-2.5'}`}
      title={label}
    >
      <Icon size={16} strokeWidth={active ? 2.5 : 1.5} />
      {!collapsed && <span className="text-sm font-bold tracking-tight">{label}</span>}
      {badge && !active && (
        <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-(--color-success) ring-2 ring-(--color-surface-secondary) animate-pulse" />
      )}
    </button>
  )
}
