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
  }, [createSession])

  const handleSelect = useCallback(
    (id: string) => {
      if (id !== activeSessionId) setActiveSession(id)
    },
    [activeSessionId, setActiveSession],
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
      className="h-full flex flex-col bg-[var(--color-surface)] border-r border-[var(--color-border)] sidebar-transition shrink-0"
      style={{ width }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-[var(--color-border)]">
        {!collapsed && (
          <>
            <button
              onClick={handleNewChat}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus size={16} />
              New Chat
            </button>
            <button
              onClick={onToggleCollapse}
              className="p-2 rounded-lg hover:bg-[var(--color-surface-dim)] text-[var(--color-text-secondary)] transition-colors"
              title="Collapse sidebar"
            >
              <ChevronLeft size={16} />
            </button>
          </>
        )}
        {collapsed && (
          <>
            <button
              onClick={handleNewChat}
              className="w-full p-2 rounded-lg hover:bg-[var(--color-surface-dim)] text-[var(--color-text-secondary)] transition-colors flex justify-center"
              title="New Chat"
            >
              <Plus size={18} />
            </button>
            <button
              onClick={onToggleCollapse}
              className="w-full p-2 rounded-lg hover:bg-[var(--color-surface-dim)] text-[var(--color-text-secondary)] transition-colors flex justify-center mt-1"
              title="Expand sidebar"
            >
              <ChevronRight size={18} />
            </button>
          </>
        )}
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-1">
        {sessions.map((session) => {
          const isActive = session.id === activeSessionId
          const title = session.title || 'New Chat'

          if (collapsed) {
            return (
              <div key={session.id} className="px-2 py-1">
                <button
                  onClick={() => handleSelect(session.id)}
                  className={`w-full p-2 rounded-lg flex justify-center transition-colors ${
                    isActive
                      ? 'bg-[var(--color-surface-dim)] text-[var(--color-primary)] border-l-2 border-[var(--color-primary)]'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-dim)]'
                  }`}
                  title={title}
                >
                  <MessageSquare size={18} />
                </button>
              </div>
            )
          }

          return (
            <div key={session.id} className="px-2 py-0.5 group">
              <button
                onClick={() => handleSelect(session.id)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-colors ${
                  isActive
                    ? 'bg-[var(--color-surface-dim)] border-l-2 border-[var(--color-primary)]'
                    : 'hover:bg-[var(--color-surface-dim)]'
                }`}
              >
                <MessageSquare
                  size={15}
                  className={
                    isActive
                      ? 'text-[var(--color-primary)] shrink-0'
                      : 'text-[var(--color-text-tertiary)] shrink-0'
                  }
                />
                <span
                  className={`flex-1 text-sm truncate ${
                    isActive
                      ? 'text-[var(--color-text-primary)] font-medium'
                      : 'text-[var(--color-text-secondary)]'
                  }`}
                >
                  {title}
                </span>
                <button
                  onClick={(e) => handleDelete(e, session.id)}
                  className="p-1 rounded hover:bg-[var(--color-error)]/10 text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] opacity-0 group-hover:opacity-100 transition-all shrink-0"
                  title="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </button>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="border-t border-[var(--color-border)] p-2 space-y-0.5">
        {/* Tasks */}
        <button
          onClick={() => onNavigate('tasks')}
          className={`flex items-center gap-2 rounded-lg transition-colors w-full ${
            currentPage === 'tasks'
              ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
              : 'hover:bg-[var(--color-surface-dim)] text-[var(--color-text-secondary)]'
          } ${collapsed ? 'p-2 justify-center' : 'px-3 py-2'}`}
          title="Tasks"
        >
          <Clock size={16} />
          {!collapsed && <span className="text-sm">Tasks</span>}
        </button>

        {/* Telegram */}
        <button
          onClick={onTelegramOpen}
          className={`flex items-center gap-2 rounded-lg transition-colors w-full ${
            isConnected
              ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]'
              : 'hover:bg-[var(--color-surface-dim)] text-[var(--color-text-secondary)]'
          } ${collapsed ? 'p-2 justify-center' : 'px-3 py-2'}`}
          title="Telegram"
        >
          <Send size={16} />
          {!collapsed && <span className="text-sm">Telegram{isConnected ? ' ✓' : ''}</span>}
        </button>

        {/* Pet */}
        <button
          onClick={onPetOpen}
          className={`flex items-center gap-2 rounded-lg transition-colors w-full ${
            showPet && pet
              ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
              : 'hover:bg-[var(--color-surface-dim)] text-[var(--color-text-secondary)]'
          } ${collapsed ? 'p-2 justify-center' : 'px-3 py-2'}`}
          title={pet ? (showPet ? 'Hide Pet' : 'Show Pet') : 'Hatch Pet'}
        >
          <PawPrint size={16} />
          {!collapsed && <span className="text-sm">{pet ? (showPet ? 'Hide Pet' : 'Show Pet') : 'Hatch Pet'}</span>}
        </button>

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          className={`flex items-center gap-2 rounded-lg hover:bg-[var(--color-surface-dim)] text-[var(--color-text-secondary)] transition-colors w-full ${
            collapsed ? 'p-2 justify-center' : 'px-3 py-2'
          }`}
          title={theme === 'light' ? 'Dark mode' : 'Light mode'}
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
          {!collapsed && <span className="text-sm">Theme</span>}
        </button>

        {/* Settings */}
        <button
          onClick={onSettingsOpen}
          className={`flex items-center gap-2 rounded-lg hover:bg-[var(--color-surface-dim)] text-[var(--color-text-secondary)] transition-colors w-full ${
            collapsed ? 'p-2 justify-center' : 'px-3 py-2'
          }`}
          title="Settings"
        >
          <Settings size={16} />
          {!collapsed && <span className="text-sm">Settings</span>}
        </button>
      </div>
    </aside>
  )
}