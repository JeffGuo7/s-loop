import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Session, Message, ProviderConfig, ProviderKind, Companion } from '../types';

interface AppState {
  // Sessions
  sessions: Session[];
  activeSessionId: string | null;
  sessionMessages: Record<string, Message[]>;

  // Provider
  activeProvider: ProviderKind;
  providerConfigs: Record<ProviderKind, ProviderConfig>;

  // UI
  theme: 'light' | 'dark';
  sidebarCollapsed: boolean;

  // Companion (pet)
  companion: Companion | null;

  // Actions
  createSession: () => string;
  deleteSession: (id: string) => void;
  setActiveSession: (id: string | null) => void;
  addMessage: (sessionId: string, message: Message) => void;
  updateSessionTitle: (id: string, title: string) => void;

  setActiveProvider: (provider: ProviderKind) => void;
  setProviderConfig: (provider: ProviderKind, config: Partial<ProviderConfig>) => void;

  setTheme: (theme: 'light' | 'dark') => void;
  toggleSidebar: () => void;

  setCompanion: (companion: Companion | null) => void;
}

const DEFAULT_PROVIDER_CONFIGS: Record<ProviderKind, ProviderConfig> = {
  anthropic: {
    apiKey: '',
    model: 'claude-sonnet-4-5-20250929',
    baseUrl: '',
  },
  openai: {
    apiKey: '',
    model: 'gpt-4o',
    baseUrl: '',
  },
};

const generateId = () => Math.random().toString(36).substring(2, 15);

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Initial state
      sessions: [],
      activeSessionId: null,
      sessionMessages: {},

      activeProvider: 'anthropic',
      providerConfigs: DEFAULT_PROVIDER_CONFIGS,

      theme: 'light',
      sidebarCollapsed: false,

      companion: null,

      // Session actions
      createSession: () => {
        const id = generateId();
        const now = Date.now();
        const newSession: Session = {
          id,
          title: 'New Chat',
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          sessions: [...state.sessions, newSession],
          activeSessionId: id,
          sessionMessages: {
            ...state.sessionMessages,
            [id]: [],
          },
        }));
        return id;
      },

      deleteSession: (id) => {
        set((state) => {
          const newSessions = state.sessions.filter((s) => s.id !== id);
          const newMessages = { ...state.sessionMessages };
          delete newMessages[id];
          return {
            sessions: newSessions,
            activeSessionId: state.activeSessionId === id
              ? newSessions[0]?.id ?? null
              : state.activeSessionId,
            sessionMessages: newMessages,
          };
        });
      },

      setActiveSession: (id) => {
        set({ activeSessionId: id });
      },

      addMessage: (sessionId, message) => {
        set((state) => ({
          sessionMessages: {
            ...state.sessionMessages,
            [sessionId]: [...(state.sessionMessages[sessionId] || []), message],
          },
        }));
      },

      updateSessionTitle: (id, title) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, title, updatedAt: Date.now() } : s
          ),
        }));
      },

      // Provider actions
      setActiveProvider: (provider) => {
        set({ activeProvider: provider });
      },

      setProviderConfig: (provider, config) => {
        set((state) => ({
          providerConfigs: {
            ...state.providerConfigs,
            [provider]: { ...state.providerConfigs[provider], ...config },
          },
        }));
      },

      // UI actions
      setTheme: (theme) => {
        set({ theme });
        document.documentElement.classList.toggle('dark', theme === 'dark');
      },

      toggleSidebar: () => {
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
      },

      // Companion actions
      setCompanion: (companion) => {
        set({ companion });
      },
    }),
    {
      name: 'snotra-storage',
      partialize: (state) => ({
        sessions: state.sessions,
        sessionMessages: state.sessionMessages,
        activeProvider: state.activeProvider,
        providerConfigs: state.providerConfigs,
        theme: state.theme,
        companion: state.companion,
      }),
    }
  )
);
