import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import i18n from '../i18n'
import type { Session, ProviderConfig, Companion, ProviderInfo, KiloMessage, MessagePart, MessageInfo } from '../types'
import * as db from '../utils/database'

interface AppState {
  // Sessions (cached from DB)
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
  locale: string
  sidebarCollapsed: boolean
  workspaceCollapsed: boolean
  workspaceDir: string | null

  // Companion (pet)
  companion: Companion | null

  // Actions - Database
  loadFromDb: () => Promise<void>
  loadMessages: (sessionId: string) => Promise<void>

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
  setLocale: (locale: string) => void
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
    (set, get) => ({
      sessions: [],
      activeSessionId: null,
      sessionMessages: {},
      streamingMessage: {},

      activeProvider: 'anthropic',
      providerConfigs: DEFAULT_CONFIGS,
      providerList: [],

      theme: 'light',
      locale: i18n.language?.startsWith('zh') ? 'zh' : 'en',
      sidebarCollapsed: false,
      workspaceCollapsed: false,
      workspaceDir: null,
      companion: null,

      // ---- Database actions ----

      loadFromDb: async () => {
        try {
          const rows = await db.getAllSessions()
          const sessions: Session[] = rows.map(r => ({
            id: r.id,
            title: r.title,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
          }))
          set({ sessions })
        } catch (err) {
          console.warn('[appStore] loadFromDb failed:', err)
        }
      },

      loadMessages: async (sessionId: string) => {
        try {
          const messages = await db.getMessages(sessionId)
          set((state) => ({
            sessionMessages: { ...state.sessionMessages, [sessionId]: messages },
          }))
        } catch (err) {
          console.warn('[appStore] loadMessages failed:', err)
        }
      },

      // ---- Session actions ----

      createSession: () => {
        const id = generateId()
        const now = Date.now()
        const session: Session = { id, title: 'New Chat', createdAt: now, updatedAt: now }
        set((state) => ({
          sessions: [...state.sessions, session],
          activeSessionId: id,
          sessionMessages: { ...state.sessionMessages, [id]: [] },
        }))
        db.createSession(id, 'New Chat').catch(console.warn)
        return id
      },

      deleteSession: (id) => {
        const state = get()
        set({
          sessions: state.sessions.filter((s) => s.id !== id),
          activeSessionId: state.activeSessionId === id ? (state.sessions.find(s => s.id !== id)?.id ?? null) : state.activeSessionId,
          sessionMessages: Object.fromEntries(
            Object.entries(state.sessionMessages).filter(([k]) => k !== id)
          ),
          streamingMessage: Object.fromEntries(
            Object.entries(state.streamingMessage).filter(([k]) => k !== id)
          ),
        })
        db.deleteSession(id).catch(console.warn)
      },

      setActiveSession: (id) => {
        set({ activeSessionId: id })
        if (id) {
          const existing = get().sessionMessages[id]
          if (!existing || existing.length === 0) {
            get().loadMessages(id).catch(console.warn)
          }
        }
      },

      updateSessionTitle: (id, title) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, title, updatedAt: Date.now() } : s,
          ),
        }))
        db.updateSession(id, { title }).catch(console.warn)
      },

      clearSessions: () => {
        const ids = get().sessions.map(s => s.id)
        set({
          sessions: [],
          activeSessionId: null,
          sessionMessages: {},
          streamingMessage: {},
        })
        Promise.all(ids.map(sid => db.deleteSession(sid))).catch(console.warn)
      },

      // ---- Message actions ----

      addMessage: (sessionId, message) => {
        set((state) => ({
          sessionMessages: {
            ...state.sessionMessages,
            [sessionId]: [...(state.sessionMessages[sessionId] || []), message],
          },
        }))
        db.saveMessage(
          message.info.id,
          sessionId,
          message.info.role,
          message.parts,
          message.info as unknown as Record<string, unknown>,
        ).catch(console.warn)
      },

      updateMessagePart: (sessionId, messageID, partID, part) => {
        set((state) => {
          const messages = state.sessionMessages[sessionId] || []
          const updated = messages.map((msg) => {
            if (msg.info.id !== messageID) return msg
            const parts = msg.parts.map((p) => (p.id === partID ? part : p))
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

      // ---- Streaming actions ----

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
        const state = get()
        const streaming = state.streamingMessage[sessionId]
        if (!streaming) return

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

        set({
          sessionMessages: {
            ...state.sessionMessages,
            [sessionId]: [...(state.sessionMessages[sessionId] || []), newMessage],
          },
          streamingMessage: updated,
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
        db.saveMessage(
          message.info.id,
          sessionId,
          message.info.role,
          message.parts,
          message.info as unknown as Record<string, unknown>,
        ).catch(console.warn)
      },

      // ---- Provider actions ----

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

      // ---- UI actions ----

      setTheme: (theme) => {
        set({ theme })
        document.documentElement.classList.toggle('dark', theme === 'dark')
      },

      setLocale: (locale) => {
        set({ locale })
        i18n.changeLanguage(locale)
      },

      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      toggleWorkspace: () => set((state) => ({ workspaceCollapsed: !state.workspaceCollapsed })),
      setWorkspaceDir: (dir) => set({ workspaceDir: dir }),

      // ---- Companion actions ----

      setCompanion: (companion) => set({ companion }),
    }),
    {
      name: 'snotra-storage',
      partialize: (state) => ({
        activeProvider: state.activeProvider,
        providerConfigs: state.providerConfigs,
        theme: state.theme,
        locale: state.locale,
        companion: state.companion,
        workspaceDir: state.workspaceDir,
      }),
      version: 2,
      migrate: (persistedState: unknown) => {
        const state = (persistedState || {}) as Record<string, unknown>
        delete state.sessions
        delete state.sessionMessages
        return state as Partial<AppState>
      },
    },
  ),
)
