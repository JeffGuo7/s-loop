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
import { useAppStore, usePetStore, useTelegramStore } from '../../stores'
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
      <div className="px-4 pt-5 pb-4 border-b border-(--color-border-light)">
        {!collapsed && (
          <>
            <button
              onClick={handleNewChat}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-(--color-accent) text-white text-sm font-semibold hover:bg-(--color-accent-light) active:scale-[0.98] transition-all shadow-sm shadow-(--color-accent)/20"
            >
              <Plus size={18} />
              New Chat
            </button>
            <div className="mt-3 flex items-center justify-between">
              <span className="section-kicker">Conversations</span>
              <button
                onClick={onToggleCollapse}
                className="p-2 rounded-lg hover:bg-(--color-surface-secondary) text-(--color-text-tertiary) transition-all"
                title="Collapse sidebar"
              >
                <ChevronLeft size={16} />
              </button>
            </div>
          </>
        )}
        {collapsed && (
          <div className="flex flex-col gap-3 w-full items-center pt-2">
            <button
              onClick={handleNewChat}
              className="p-3 rounded-xl bg-(--color-accent) text-white hover:bg-(--color-accent-light) active:scale-[0.95] transition-all"
              title="New Chat"
            >
              <Plus size={20} />
            </button>
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
      <div className="flex-1 overflow-y-auto px-3 pb-3 pt-2 scrollbar-subtle space-y-1">
        {sessions.map((session) => {
          const isActive = session.id === activeSessionId
          const title = session.title || 'New Chat'

          if (collapsed) {
            return (
              <button
                key={session.id}
                onClick={() => handleSelect(session.id)}
                className={`w-full aspect-square flex items-center justify-center rounded-xl transition-all ${
                  isActive
                    ? 'bg-(--color-accent-muted) text-(--color-accent) shadow-sm'
                    : 'text-(--color-text-tertiary) hover:bg-(--color-surface-secondary)'
                }`}
                title={title}
              >
                <MessageSquare size={18} strokeWidth={isActive ? 2 : 1.5} />
              </button>
            )
          }

          return (
            <div key={session.id} className="group relative flex items-center">
              <button
                onClick={() => handleSelect(session.id)}
                className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all ${
                  isActive
                    ? 'bg-(--color-accent-muted) text-(--color-accent) border border-(--color-accent)/20'
                    : 'text-(--color-text-secondary) hover:bg-(--color-surface-secondary) border border-transparent'
                }`}
              >
                <MessageSquare
                  size={16}
                  strokeWidth={isActive ? 2 : 1.5}
                  className={isActive ? 'text-(--color-accent)' : 'text-(--color-text-quaternary)'}
                />
                <span className={`flex-1 text-sm truncate ${isActive ? 'font-medium' : ''}`}>
                  {title}
                </span>
              </button>
              <button
                onClick={(e) => handleDelete(e, session.id)}
                className="absolute right-2 p-1.5 rounded-md text-(--color-text-quaternary) hover:text-(--color-error) hover:bg-(--color-error-bg) opacity-0 group-hover:opacity-100 transition-all"
                title="Delete"
              >
                <Trash2 size={13} />
              </button>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="p-3 space-y-2 border-t border-(--color-border-light)">
        <div className="surface-panel-subtle p-1.5">
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

        <div className="flex gap-1.5">
          <button
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className={`flex items-center justify-center rounded-lg hover:bg-(--color-surface-hover) text-(--color-text-tertiary) hover:text-(--color-text-secondary) transition-all ${
              collapsed ? 'w-full h-9' : 'flex-1 h-9'
            }`}
            title={theme === 'light' ? 'Dark mode' : 'Light mode'}
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          {!collapsed && (
            <button
              onClick={onSettingsOpen}
              className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-(--color-surface-hover) text-(--color-text-tertiary) hover:text-(--color-text-secondary) transition-all"
              title="Settings"
            >
              <Settings size={16} />
            </button>
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
      className={`flex items-center gap-3 rounded-lg transition-all w-full relative group ${
        active
          ? 'bg-(--color-accent-muted) text-(--color-accent)'
          : 'hover:bg-(--color-surface-hover) text-(--color-text-tertiary)'
      } ${collapsed ? 'aspect-square justify-center' : 'px-4 py-2.5'}`}
      title={label}
    >
      <Icon size={16} strokeWidth={active ? 2 : 1.5} />
      {!collapsed && <span className="text-sm">{label}</span>}
      {badge && !active && (
        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-(--color-success) ring-2 ring-(--color-surface-secondary)" />
      )}
    </button>
  )
}
