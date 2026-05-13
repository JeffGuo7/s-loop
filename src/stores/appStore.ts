import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Session, Message, ProviderConfig, Companion, ProviderInfo } from '../types'

interface AppState {
  // Sessions
  sessions: Session[]
  activeSessionId: string | null
  sessionMessages: Record<string, Message[]>

  // Provider — now dynamic (any Kilo provider ID)
  activeProvider: string
  providerConfigs: Record<string, ProviderConfig>
  providerList: ProviderInfo[] // from Kilo /provider API

  // UI
  theme: 'light' | 'dark'
  sidebarCollapsed: boolean

  // Companion (pet)
  companion: Companion | null

  // Actions
  createSession: () => string
  deleteSession: (id: string) => void
  setActiveSession: (id: string | null) => void
  addMessage: (sessionId: string, message: Message) => void
  updateSessionTitle: (id: string, title: string) => void

  setActiveProvider: (id: string) => void
  setProviderConfig: (id: string, config: Partial<ProviderConfig>) => void
  setProviderList: (list: ProviderInfo[]) => void

  setTheme: (theme: 'light' | 'dark') => void
  toggleSidebar: () => void

  setCompanion: (companion: Companion | null) => void
}

const DEFAULT_CONFIGS: Record<string, ProviderConfig> = {
  anthropic: { apiKey: '', model: 'claude-sonnet-4-5-20250929', baseUrl: '' },
  openai: { apiKey: '', model: 'gpt-4o', baseUrl: '' },
}

const generateId = () => Math.random().toString(36).substring(2, 15)

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sessions: [],
      activeSessionId: null,
      sessionMessages: {},

      activeProvider: 'anthropic',
      providerConfigs: DEFAULT_CONFIGS,
      providerList: [],

      theme: 'light',
      sidebarCollapsed: false,
      companion: null,

      createSession: () => {
        const id = generateId()
        const now = Date.now()
        set((state) => ({
          sessions: [...state.sessions, { id, title: 'New Chat', createdAt: now, updatedAt: now }],
          activeSessionId: id,
          sessionMessages: { ...state.sessionMessages, [id]: [] },
        }))
        return id
      },

      deleteSession: (id) => {
        set((state) => {
          const all = state.sessions.filter((s) => s.id !== id)
          const msgs = { ...state.sessionMessages }
          delete msgs[id]
          return {
            sessions: all,
            activeSessionId: state.activeSessionId === id ? all[0]?.id ?? null : state.activeSessionId,
            sessionMessages: msgs,
          }
        })
      },

      setActiveSession: (id) => set({ activeSessionId: id }),

      addMessage: (sessionId, message) => {
        set((state) => ({
          sessionMessages: {
            ...state.sessionMessages,
            [sessionId]: [...(state.sessionMessages[sessionId] || []), message],
          },
        }))
      },

      updateSessionTitle: (id, title) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, title, updatedAt: Date.now() } : s,
          ),
        }))
      },

      setActiveProvider: (id) => set({ activeProvider: id }),

      setProviderConfig: (id, config) => {
        set((state) => ({
          providerConfigs: {
            ...state.providerConfigs,
            [id]: { ...(state.providerConfigs[id] || { apiKey: '', model: '', baseUrl: '' }), ...config },
          },
        }))
      },

      setProviderList: (list) => set({ providerList: list }),

      setTheme: (theme) => {
        set({ theme })
        document.documentElement.classList.toggle('dark', theme === 'dark')
      },

      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      setCompanion: (companion) => set({ companion }),
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
    },
  ),
)
