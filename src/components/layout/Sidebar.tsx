import { useAppStore, usePetStore, useTelegramStore } from '../../stores';
import type { Page } from '../../App';
import {
  Plus,
  MessageSquare,
  Settings,
  Moon,
  Sun,
  Trash2,
  PawPrint,
  Clock,
  Send,
} from 'lucide-react';

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onOpenSettings: () => void;
  onOpenPet: () => void;
  onOpenTelegram: () => void;
}

export function Sidebar({ currentPage, onNavigate, onOpenSettings, onOpenPet, onOpenTelegram }: SidebarProps) {
  const {
    sessions,
    activeSessionId,
    createSession,
    deleteSession,
    setActiveSession,
    theme,
    setTheme,
    sidebarCollapsed,
  } = useAppStore();

  const { pet, showPet } = usePetStore();
  const { isConnected } = useTelegramStore();

  const handleNewChat = () => {
    createSession();
    onNavigate('chat');
  };

  return (
    <aside
      className={`
        flex flex-col h-full bg-[var(--color-surface)] border-r border-[var(--color-border)]
        transition-all duration-300
        ${sidebarCollapsed ? 'w-16' : 'w-64'}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
        {!sidebarCollapsed && (
          <h1 className="text-lg font-bold text-[var(--color-primary)]">Snotra</h1>
        )}
        <button
          onClick={handleNewChat}
          className="p-2 rounded-lg hover:bg-[var(--color-surface-dim)] transition-colors"
          title="New Chat"
        >
          <Plus size={20} />
        </button>
      </div>

      {/* Navigation */}
      <div className="p-2 border-b border-[var(--color-border)]">
        <button
          onClick={() => onNavigate('chat')}
          className={`
            w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors
            ${currentPage === 'chat'
              ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
              : 'hover:bg-[var(--color-surface-dim)]'
            }
          `}
        >
          <MessageSquare size={18} />
          {!sidebarCollapsed && <span className="text-sm">Chats</span>}
        </button>
        <button
          onClick={() => onNavigate('tasks')}
          className={`
            w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors
            ${currentPage === 'tasks'
              ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
              : 'hover:bg-[var(--color-surface-dim)]'
            }
          `}
        >
          <Clock size={18} />
          {!sidebarCollapsed && <span className="text-sm">Tasks</span>}
        </button>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto p-2">
        {sessions.length === 0 && !sidebarCollapsed && currentPage === 'chat' && (
          <p className="text-sm text-[var(--color-text-secondary)] text-center py-4">
            No conversations yet
          </p>
        )}
        {currentPage === 'chat' && sessions.map((session) => (
          <div
            key={session.id}
            className={`
              group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer
              transition-colors
              ${activeSessionId === session.id
                ? 'bg-[var(--color-primary)] text-white'
                : 'hover:bg-[var(--color-surface-dim)]'
              }
            `}
            onClick={() => setActiveSession(session.id)}
          >
            <MessageSquare size={18} />
            {!sidebarCollapsed && (
              <>
                <span className="flex-1 truncate text-sm">{session.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSession(session.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-all"
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-[var(--color-border)]">
        {/* Telegram Button */}
        <button
          onClick={onOpenTelegram}
          className={`
            w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors
            ${isConnected
              ? 'bg-green-500/10 text-green-500'
              : 'hover:bg-[var(--color-surface-dim)]'
            }
          `}
        >
          <Send size={18} />
          {!sidebarCollapsed && (
            <span className="text-sm">
              Telegram {isConnected ? '(Connected)' : ''}
            </span>
          )}
        </button>

        {/* Pet Button */}
        <button
          onClick={onOpenPet}
          className={`
            w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors
            ${showPet && pet
              ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
              : 'hover:bg-[var(--color-surface-dim)]'
            }
          `}
        >
          <PawPrint size={18} />
          {!sidebarCollapsed && (
            <span className="text-sm">
              {pet ? (showPet ? 'Hide Pet' : 'Show Pet') : 'Hatch Pet'}
            </span>
          )}
        </button>

        {/* Theme Toggle */}
        <button
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[var(--color-surface-dim)] transition-colors"
        >
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          {!sidebarCollapsed && <span className="text-sm">Toggle Theme</span>}
        </button>

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[var(--color-surface-dim)] transition-colors"
        >
          <Settings size={18} />
          {!sidebarCollapsed && <span className="text-sm">Settings</span>}
        </button>
      </div>
    </aside>
  );
}