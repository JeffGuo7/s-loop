import { create } from 'zustand'
import type { PlatformConfig, PlatformId, PlatformMessage } from '../types/platform'
import { PLATFORM_PRESETS } from '../types/platform'
import {
  clearPlatformMessages,
  connectPlatform,
  disconnectPlatform,
  loadPlatformSnapshot,
  savePlatformConfig,
  sendPlatformMessage,
  testPlatformMessage,
} from '../utils/platformClient'

interface PlatformState {
  platforms: PlatformConfig[]
  messages: PlatformMessage[]
  isConnecting: Record<string, boolean>
  error: string | null

  load: () => Promise<void>
  updatePlatform: (id: PlatformId, values: Record<string, string>) => void
  connect: (id: PlatformId) => Promise<void>
  disconnect: (id: PlatformId) => Promise<void>
  send: (id: PlatformId, text: string) => Promise<void>
  clearMessages: () => Promise<void>
  test: (id: PlatformId) => Promise<string | null>
}

export const usePlatformStore = create<PlatformState>()((set, get) => ({
  platforms: PLATFORM_PRESETS.map((p) => ({ ...p, values: { ...p.values } })),
  messages: [],
  isConnecting: {},
  error: null,

  load: async () => {
    try {
      const snapshot = await loadPlatformSnapshot()
      set({
        platforms: snapshot.platforms,
        messages: snapshot.messages,
        error: null,
      })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  updatePlatform: (id, values) => {
    set((state) => ({
      platforms: state.platforms.map((platform) =>
        platform.id === id
          ? { ...platform, values: { ...platform.values, ...values } }
          : platform,
      ),
    }))
    void savePlatformConfig(id, values).catch(() => {})
  },

  connect: async (id) => {
    set((state) => ({ isConnecting: { ...state.isConnecting, [id]: true }, error: null }))
    try {
      const platform = get().platforms.find((item) => item.id === id)
      const snapshot = await connectPlatform(id, platform?.values || {})
      set((state) => ({
        platforms: snapshot.platforms,
        messages: snapshot.messages,
        isConnecting: { ...state.isConnecting, [id]: false },
        error: null,
      }))
    } catch (err) {
      set((state) => ({
        isConnecting: { ...state.isConnecting, [id]: false },
        error: err instanceof Error ? err.message : String(err),
      }))
    }
  },

  disconnect: async (id) => {
    try {
      const snapshot = await disconnectPlatform(id)
      set({
        platforms: snapshot.platforms,
        messages: snapshot.messages,
        error: null,
      })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  send: async (id, text) => {
    try {
      const snapshot = await sendPlatformMessage(id, text)
      set({
        platforms: snapshot.platforms,
        messages: snapshot.messages,
        error: null,
      })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
      throw err
    }
  },

  clearMessages: async () => {
    try {
      const snapshot = await clearPlatformMessages()
      set({
        platforms: snapshot.platforms,
        messages: snapshot.messages,
        error: null,
      })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  test: async (id) => {
    const platform = get().platforms.find((p) => p.id === id)
    if (!platform || !platform.connected) return 'Not connected'
    try {
      const snapshot = await testPlatformMessage(id)
      set({
        platforms: snapshot.platforms,
        messages: snapshot.messages,
        error: null,
      })
      return null
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Test failed'
      set({ error: message })
      return message
    }
  },
}))
