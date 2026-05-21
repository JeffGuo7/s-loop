import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Session, ProviderConfig, Companion, ProviderInfo, KiloMessage, MessagePart, MessageInfo } from '../types'

interface AppState {
  // Sessions
  sessions: Session[]
  activeSessionId: string | null
  sessionMessages: Record<string, KiloMessage[]>

  // Streaming state
  streamingMessage: Record<string, {
    messageID: string
    parts: MessagePart[]
    isStreaming: boolean
    info?: MessageInfo
  }>

  // Provider — now dynamic (any Kilo provider ID)
  activeProvider: string
  providerConfigs: Record<string, ProviderConfig>
  providerList: ProviderInfo[]

  // UI
  theme: 'light' | 'dark'
  sidebarCollapsed: boolean
  workspaceCollapsed: boolean
  workspaceDir: string | null

  // Companion (pet)
  companion: Companion | null

  // Actions - Sessions
  createSession: () => string
  deleteSession: (id: string) => void
  setActiveSession: (id: string | null) => void
  updateSessionTitle: (id: string, title: string) => void
  clearSessions: () => void

  // Actions - Messages
  addMessage: (sessionId: string, message: KiloMessage) => void
  updateMessagePart: (sessionId: string, messageID: string, partID: string, part: MessagePart) => void
  appendPartDelta: (sessionId: string, messageID: string, partID: string, delta: string) => void
  updateMessageInfo: (sessionId: string, messageID: string, info: MessageInfo) => void

  // Actions - Streaming
  startStreaming: (sessionId: string, messageID: string) => void
  updateStreamingMessageID: (sessionId: string, messageID: string) => void
  updateStreamingPart: (sessionId: string, partID: string, part: MessagePart) => void
  appendStreamingDelta: (sessionId: string, partID: string, delta: string) => void
  finishStreaming: (sessionId: string) => void
  commitStreamingMessage: (sessionId: string, message: KiloMessage) => void

  // Actions - Provider
  setActiveProvider: (id: string) => void
  setProviderConfig: (id: string, config: Partial<ProviderConfig>) => void
  setProviderList: (list: ProviderInfo[]) => void

  // Actions - UI
  setTheme: (theme: 'light' | 'dark') => void
  toggleSidebar: () => void
  toggleWorkspace: () => void
  setWorkspaceDir: (dir: string | null) => void

  // Actions - Companion
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
      streamingMessage: {},

      activeProvider: 'anthropic',
      providerConfigs: DEFAULT_CONFIGS,
      providerList: [],

      theme: 'light',
      sidebarCollapsed: false,
      workspaceCollapsed: false,
      workspaceDir: null,
      companion: null,

      // Session actions
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
          const streaming = { ...state.streamingMessage }
          delete streaming[id]
          return {
            sessions: all,
            activeSessionId: state.activeSessionId === id ? all[0]?.id ?? null : state.activeSessionId,
            sessionMessages: msgs,
            streamingMessage: streaming,
          }
        })
      },

      setActiveSession: (id) => set({ activeSessionId: id }),

      updateSessionTitle: (id, title) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, title, updatedAt: Date.now() } : s,
          ),
        }))
      },

      clearSessions: () => {
        set({
          sessions: [],
          activeSessionId: null,
          sessionMessages: {},
          streamingMessage: {},
        })
      },

      // Message actions
      addMessage: (sessionId, message) => {
        set((state) => ({
          sessionMessages: {
            ...state.sessionMessages,
            [sessionId]: [...(state.sessionMessages[sessionId] || []), message],
          },
        }))
      },

      updateMessagePart: (sessionId, messageID, partID, part) => {
        set((state) => {
          const messages = state.sessionMessages[sessionId] || []
          const updated = messages.map((msg) => {
            if (msg.info.id !== messageID) return msg
            const parts = msg.parts.map((p) => (p.id === partID ? part : p))
            // Add new part if not found
            if (!parts.find((p) => p.id === partID)) {
              parts.push(part)
            }
            return { ...msg, parts }
          })
          return {
            sessionMessages: { ...state.sessionMessages, [sessionId]: updated },
          }
        })
      },

      appendPartDelta: (sessionId, messageID, partID, delta) => {
        set((state) => {
          const messages = state.sessionMessages[sessionId] || []
          const updated = messages.map((msg) => {
            if (msg.info.id !== messageID) return msg
            const parts = msg.parts.map((p) => {
              if (p.id !== partID) return p
              if (p.type === 'text' || p.type === 'reasoning') {
                return { ...p, text: p.text + delta }
              }
              return p
            })
            return { ...msg, parts }
          })
          return {
            sessionMessages: { ...state.sessionMessages, [sessionId]: updated },
          }
        })
      },

      updateMessageInfo: (sessionId, messageID, info) => {
        set((state) => {
          const messages = state.sessionMessages[sessionId] || []
          const updated = messages.map((msg) => {
            if (msg.info.id !== messageID) return msg
            return { ...msg, info: { ...msg.info, ...info } }
          })
          return {
            sessionMessages: { ...state.sessionMessages, [sessionId]: updated },
          }
        })
      },

      // Streaming actions
      startStreaming: (sessionId, messageID) => {
        set((state) => ({
          streamingMessage: {
            ...state.streamingMessage,
            [sessionId]: { messageID, parts: [], isStreaming: true },
          },
        }))
      },

      updateStreamingMessageID: (sessionId, messageID) => {
        set((state) => {
          const streaming = state.streamingMessage[sessionId]
          if (!streaming) return state
          return {
            streamingMessage: {
              ...state.streamingMessage,
              [sessionId]: { ...streaming, messageID },
            },
          }
        })
      },

      updateStreamingPart: (sessionId, partID, part) => {
        set((state) => {
          const streaming = state.streamingMessage[sessionId]
          if (!streaming) return state
          
          // STRICT CHECK: Ensure part belongs to the streaming message
          // Only enforce this if we have locked onto a non-pending messageID
          if (!streaming.messageID.startsWith('pending-') && part.messageID !== streaming.messageID) {
            return state
          }

          const parts = [...streaming.parts]
          const idx = parts.findIndex((p) => p.id === partID)
          if (idx >= 0) {
            const existing = parts[idx]
            if (
              (existing.type === 'text' || existing.type === 'reasoning') &&
              (part.type === 'text' || part.type === 'reasoning') &&
              existing.text.length > (part.text?.length ?? 0)
            ) {
              parts[idx] = { ...part, text: existing.text }
            } else {
              parts[idx] = part
            }
          } else {
            parts.push(part)
          }
          return {
            streamingMessage: {
              ...state.streamingMessage,
              [sessionId]: { ...streaming, parts },
            },
          }
        })
      },

      appendStreamingDelta: (sessionId, partID, delta) => {
        set((state) => {
          const streaming = state.streamingMessage[sessionId]
          if (!streaming) return state

          const idx = streaming.parts.findIndex((p) => p.id === partID)
          let parts = [...streaming.parts]

          if (idx === -1) {
            parts.push({
              id: partID,
              type: 'text',
              text: delta,
              sessionID: streaming.info?.sessionID || sessionId,
              messageID: streaming.messageID,
            })
          } else {
            parts = streaming.parts.map((p) => {
              if (p.id !== partID) return p
              if (p.type === 'text' || p.type === 'reasoning') {
                return { ...p, text: p.text + delta }
              }
              return p
            })
          }

          return {
            streamingMessage: {
              ...state.streamingMessage,
              [sessionId]: { ...streaming, parts },
            },
          }
        })
      },

      finishStreaming: (sessionId) => {
        set((state) => {
          const streaming = state.streamingMessage[sessionId]
          if (!streaming) return state

          // Use info from SSE events if available, otherwise create default
          const info = streaming.info || {
            id: streaming.messageID,
            sessionID: sessionId,
            role: 'assistant' as const,
            time: { created: Date.now(), completed: Date.now() },
          }

          const newMessage: KiloMessage = {
            info,
            parts: streaming.parts,
          }

          const updated = { ...state.streamingMessage }
          delete updated[sessionId]

          return {
            sessionMessages: {
              ...state.sessionMessages,
              [sessionId]: [...(state.sessionMessages[sessionId] || []), newMessage],
            },
            streamingMessage: updated,
          }
        })
      },

      commitStreamingMessage: (sessionId, message) => {
        set((state) => {
          const updatedStreaming = { ...state.streamingMessage }
          delete updatedStreaming[sessionId]

          const existingMessages = state.sessionMessages[sessionId] || []
          const existingIndex = existingMessages.findIndex((msg) => msg.info.id === message.info.id)
          const nextMessages =
            existingIndex >= 0
              ? existingMessages.map((msg, index) => (index === existingIndex ? message : msg))
              : [...existingMessages, message]

          return {
            sessionMessages: {
              ...state.sessionMessages,
              [sessionId]: nextMessages,
            },
            streamingMessage: updatedStreaming,
          }
        })
      },

      // Provider actions
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

      // UI actions
      setTheme: (theme) => {
        set({ theme })
        document.documentElement.classList.toggle('dark', theme === 'dark')
      },

      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      toggleWorkspace: () => set((state) => ({ workspaceCollapsed: !state.workspaceCollapsed })),
      setWorkspaceDir: (dir) => set({ workspaceDir: dir }),

      // Companion actions
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
        workspaceDir: state.workspaceDir,
      }),
      // Migrate old data format to new format
      version: 1,
      migrate: (persistedState: unknown) => {
        const persisted = (persistedState || {}) as Record<string, unknown>
        // Ensure sessionMessages is in the new KiloMessage[] format
        if (persisted.sessionMessages && typeof persisted.sessionMessages === 'object') {
          const msgs = persisted.sessionMessages as Record<string, unknown[]>
          for (const key of Object.keys(msgs)) {
            if (!Array.isArray(msgs[key])) {
              msgs[key] = []
            }
          }
        }
        return persisted as Partial<AppState>
      },
    },
  ),
)
