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
      className="h-full flex flex-col bg-[var(--color-surface-dim)] border-r border-[var(--color-border)] sidebar-transition shrink-0 z-20"
      style={{ width }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-6">
        {!collapsed && (
          <>
            <button
              onClick={handleNewChat}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-[var(--color-primary)] text-white text-sm font-bold shadow-lg shadow-[var(--color-primary)]/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              <Plus size={18} strokeWidth={3} />
              New Chat
            </button>
            <button
              onClick={onToggleCollapse}
              className="p-2.5 rounded-xl hover:bg-[var(--color-surface)] text-[var(--color-text-secondary)] transition-all"
              title="Collapse sidebar"
            >
              <ChevronLeft size={18} />
            </button>
          </>
        )}
        {collapsed && (
          <div className="flex flex-col gap-3 w-full items-center">
            <button
              onClick={handleNewChat}
              className="p-3 rounded-2xl bg-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/20 hover:scale-[1.05] active:scale-[0.95] transition-all"
              title="New Chat"
            >
              <Plus size={20} strokeWidth={3} />
            </button>
            <button
              onClick={onToggleCollapse}
              className="p-2 rounded-xl hover:bg-[var(--color-surface)] text-[var(--color-text-secondary)] transition-all"
              title="Expand sidebar"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 custom-scrollbar space-y-1">
        {!collapsed && (
          <div className="px-3 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] opacity-60">
              Recent Chats
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
                className={`w-full aspect-square flex items-center justify-center rounded-2xl transition-all ${
                  isActive
                    ? 'bg-[var(--color-primary)] text-white shadow-md'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]'
                }`}
                title={title}
              >
                <MessageSquare size={20} strokeWidth={isActive ? 2.5 : 2} />
              </button>
            )
          }

          return (
            <div key={session.id} className="group relative flex items-center">
              <button
                onClick={() => handleSelect(session.id)}
                className={`flex-1 flex items-center gap-3 px-3 py-3 rounded-2xl text-left transition-all ${
                  isActive
                    ? 'bg-[var(--color-surface)] shadow-sm text-[var(--color-primary)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)]/60'
                }`}
              >
                <MessageSquare
                  size={16}
                  strokeWidth={isActive ? 2.5 : 2}
                  className={isActive ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-tertiary)]'}
                />
                <span className={`flex-1 text-sm truncate ${isActive ? 'font-bold' : 'font-medium'}`}>
                  {title}
                </span>
              </button>
              <button
                onClick={(e) => handleDelete(e, session.id)}
                className="absolute right-2 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] opacity-0 group-hover:opacity-100 transition-all"
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="p-4 space-y-2">
        <div className="bg-[var(--color-surface)]/50 rounded-3xl p-2 border border-[var(--color-border)]/50">
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
          <button
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            className={`flex items-center justify-center rounded-2xl hover:bg-[var(--color-surface)] text-[var(--color-text-secondary)] transition-all ${
              collapsed ? 'w-full h-10' : 'flex-1 h-10'
            }`}
            title={theme === 'light' ? 'Dark mode' : 'Light mode'}
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          {!collapsed && (
            <button
              onClick={onSettingsOpen}
              className="flex items-center justify-center w-10 h-10 rounded-2xl hover:bg-[var(--color-surface)] text-[var(--color-text-secondary)] transition-all"
              title="Settings"
            >
              <Settings size={18} />
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
      className={`flex items-center gap-3 rounded-2xl transition-all w-full relative group ${
        active
          ? 'bg-[var(--color-primary)] text-white shadow-sm'
          : 'hover:bg-[var(--color-surface)] text-[var(--color-text-secondary)]'
      } ${collapsed ? 'aspect-square justify-center' : 'px-3 py-2.5'}`}
      title={label}
    >
      <Icon size={18} strokeWidth={active ? 2.5 : 2} />
      {!collapsed && <span className={`text-sm ${active ? 'font-bold' : 'font-medium'}`}>{label}</span>}
      {badge && !active && (
        <div className="absolute top-2 right-2 w-2 h-2 bg-[var(--color-success)] rounded-full border-2 border-[var(--color-surface)]" />
      )}
    </button>
  )
}