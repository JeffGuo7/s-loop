import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PlatformConfig, PlatformId, PlatformMessage } from '../types/platform'
import { PLATFORM_PRESETS } from '../types/platform'

interface PlatformState {
  platforms: PlatformConfig[]
  messages: PlatformMessage[]
  isConnecting: Record<string, boolean>
  error: string | null

  updatePlatform: (id: PlatformId, values: Record<string, string>) => void
  togglePlatform: (id: PlatformId) => void
  connect: (id: PlatformId) => Promise<void>
  disconnect: (id: PlatformId) => void
  send: (id: PlatformId, text: string) => Promise<void>
  clearMessages: () => void
  test: (id: PlatformId) => Promise<string | null>
}

const generateId = () => Math.random().toString(36).substring(2, 15)

export const usePlatformStore = create<PlatformState>()(
  persist(
    (set, get) => ({
      platforms: PLATFORM_PRESETS.map((p) => ({ ...p })),
      messages: [],
      isConnecting: {},
      error: null,

      updatePlatform: (id, values) => {
        set((state) => ({
          platforms: state.platforms.map((p) =>
            p.id === id ? { ...p, values: { ...p.values, ...values } } : p
          ),
        }))
      },

      togglePlatform: (id) => {
        set((state) => ({
          platforms: state.platforms.map((p) =>
            p.id === id ? { ...p, enabled: !p.enabled } : p
          ),
        }))
      },

      connect: async (id) => {
        set((state) => ({ isConnecting: { ...state.isConnecting, [id]: true }, error: null }))
        try {
          // Simulate connection — replace with real backend call later
          await new Promise((r) => setTimeout(r, 1000))
          set((state) => ({
            platforms: state.platforms.map((p) => (p.id === id ? { ...p, connected: true } : p)),
            isConnecting: { ...state.isConnecting, [id]: false },
          }))
        } catch (err) {
          set((state) => ({
            isConnecting: { ...state.isConnecting, [id]: false },
            error: err instanceof Error ? err.message : 'Connection failed',
          }))
        }
      },

      disconnect: (id) => {
        set((state) => ({
          platforms: state.platforms.map((p) => (p.id === id ? { ...p, connected: false } : p)),
        }))
      },

      send: async (id, text) => {
        const msg: PlatformMessage = {
          id: generateId(),
          platformId: id,
          direction: 'sent',
          text,
          timestamp: Date.now(),
        }
        set((state) => ({ messages: [...state.messages, msg] }))
        // TODO: real send via backend
      },

      clearMessages: () => set({ messages: [] }),

      test: async (id) => {
        const platform = get().platforms.find((p) => p.id === id)
        if (!platform || !platform.connected) return 'Not connected'
        try {
          await get().send(id, `Test message from S-Loop at ${new Date().toLocaleString()}`)
          return null
        } catch (err) {
          return err instanceof Error ? err.message : 'Test failed'
        }
      },
    }),
    {
      name: 'snotra-platform-storage',
      partialize: (state) => ({
        platforms: state.platforms,
        messages: state.messages.slice(-100),
      }),
    }
  )
)
