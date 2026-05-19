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
      className="h-full flex flex-col bg-[var(--color-surface-secondary)] border-r border-[var(--color-border)] sidebar-transition shrink-0 z-20"
      style={{ width }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-5">
        {!collapsed && (
          <>
            <button
              onClick={handleNewChat}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-light)] active:scale-[0.98] transition-all"
            >
              <Plus size={18} />
              New Chat
            </button>
            <button
              onClick={onToggleCollapse}
              className="p-2 rounded-lg hover:bg-[var(--color-surface)] text-[var(--color-text-tertiary)] transition-all"
              title="Collapse sidebar"
            >
              <ChevronLeft size={16} />
            </button>
          </>
        )}
        {collapsed && (
          <div className="flex flex-col gap-3 w-full items-center pt-2">
            <button
              onClick={handleNewChat}
              className="p-3 rounded-xl bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-light)] active:scale-[0.95] transition-all"
              title="New Chat"
            >
              <Plus size={20} />
            </button>
            <button
              onClick={onToggleCollapse}
              className="p-2 rounded-lg hover:bg-[var(--color-surface)] text-[var(--color-text-tertiary)] transition-all"
              title="Expand sidebar"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-3 pb-2 scrollbar-subtle space-y-0.5">
        {!collapsed && (
          <div className="px-3 mb-2 mt-1">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-quaternary)]">
              Recent
            </span>
          </div>
        )}
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
                    ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
                    : 'text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface)]'
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
                className={`flex-1 flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                  isActive
                    ? 'bg-[var(--color-surface)] text-[var(--color-accent)] shadow-xs'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
                }`}
              >
                <MessageSquare
                  size={16}
                  strokeWidth={isActive ? 2 : 1.5}
                  className={isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-quaternary)]'}
                />
                <span className={`flex-1 text-sm truncate ${isActive ? 'font-medium' : ''}`}>
                  {title}
                </span>
              </button>
              <button
                onClick={(e) => handleDelete(e, session.id)}
                className="absolute right-1.5 p-1.5 rounded-md text-[var(--color-text-quaternary)] hover:text-[var(--color-error)] hover:bg-[var(--color-error-bg)] opacity-0 group-hover:opacity-100 transition-all"
                title="Delete"
              >
                <Trash2 size={13} />
              </button>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="p-3 space-y-2">
        <div className="bg-[var(--color-surface)]/80 rounded-xl p-1.5 border border-[var(--color-border-light)]">
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
            className={`flex items-center justify-center rounded-lg hover:bg-[var(--color-surface-hover)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-all ${
              collapsed ? 'w-full h-9' : 'flex-1 h-9'
            }`}
            title={theme === 'light' ? 'Dark mode' : 'Light mode'}
          >
            {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          {!collapsed && (
            <button
              onClick={onSettingsOpen}
              className="flex items-center justify-center w-9 h-9 rounded-lg hover:bg-[var(--color-surface-hover)] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-all"
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
  icon: any;
  label: string;
  active: boolean;
  onClick: () => void;
  collapsed: boolean;
  badge?: boolean;
}

function NavItem({ icon: Icon, label, active, onClick, collapsed, badge }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 rounded-lg transition-all w-full relative group ${
        active
          ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)]'
          : 'hover:bg-[var(--color-surface-hover)] text-[var(--color-text-tertiary)]'
      } ${collapsed ? 'aspect-square justify-center' : 'px-3 py-2'}`}
      title={label}
    >
      <Icon size={16} strokeWidth={active ? 2 : 1.5} />
      {!collapsed && <span className="text-sm">{label}</span>}
      {badge && !active && (
        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[var(--color-success)] ring-2 ring-[var(--color-surface-secondary)]" />
      )}
    </button>
  )
}