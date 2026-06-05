import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { WebSearchConfig, WebSearchProviderId, WebSearchProviderConfig } from '../types/websearch'
import { WEB_SEARCH_PROVIDERS } from '../types/websearch'

interface WebSearchState {
  /** Currently active provider ID */
  activeProvider: WebSearchProviderId

  /** Provider-specific configs (keys, urls) */
  providers: WebSearchProviderConfig[]

  /** Max search results (1-20) */
  maxResults: number

  /** Build the config to send to pi-server */
  getActiveConfig: () => WebSearchConfig

  /** Update a provider's config */
  updateProvider: (id: WebSearchProviderId, updates: Partial<WebSearchProviderConfig>) => void

  /** Switch active provider */
  setActiveProvider: (id: WebSearchProviderId) => void

  /** Set max results */
  setMaxResults: (limit: number) => void

  /** Toggle a provider on/off (can't disable DuckDuckGo) */
  toggleProvider: (id: WebSearchProviderId) => void
}

export const useWebSearchStore = create<WebSearchState>()(
  persist(
    (set, get) => ({
      activeProvider: 'bing',
      providers: WEB_SEARCH_PROVIDERS,
      maxResults: 5,

      getActiveConfig: () => {
        const state = get()
        const provider = state.providers.find(p => p.id === state.activeProvider)
        const config: WebSearchConfig = {
          provider: state.activeProvider,
          limit: state.maxResults,
        }
        if (provider?.apiKey) config.apiKey = provider.apiKey
        if (provider?.apiUrl) config.apiUrl = provider.apiUrl
        return config
      },

      updateProvider: (id, updates) => {
        set(state => ({
          providers: state.providers.map(p =>
            p.id === id ? { ...p, ...updates } : p
          ),
        }))
      },

      setActiveProvider: (id) => {
        // Auto-enable the selected provider if it was disabled
        set(state => ({
          activeProvider: id,
          providers: state.providers.map(p =>
            p.id === id && !p.enabled ? { ...p, enabled: true } : p
          ),
        }))
      },

      setMaxResults: (limit) => {
        set({ maxResults: Math.max(1, Math.min(limit, 20)) })
      },

      toggleProvider: (id) => {
        set(state => ({
          providers: state.providers.map(p =>
            p.id === id ? { ...p, enabled: !p.enabled } : p
          ),
        }))
      },
    }),
    {
      name: 'snotra-websearch-storage',
      partialize: (state) => ({
        activeProvider: state.activeProvider,
        providers: state.providers,
        maxResults: state.maxResults,
      }),
    }
  )
)
