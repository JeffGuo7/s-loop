import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { WebSearchConfig, WebSearchProviderId, WebSearchProviderConfig } from '../types/websearch'
import { WEB_SEARCH_PROVIDERS } from '../types/websearch'
import {
  mergeProtectedCredential,
  readProtectedCredential,
  webSearchCredentialName,
} from '../utils/credentialVault'

export function redactWebSearchProviders(
  providers: WebSearchProviderConfig[],
): WebSearchProviderConfig[] {
  return providers.map((provider) => ({ ...provider, apiKey: '' }))
}

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

  /** Load API keys from the OS-protected credential vault. */
  hydrateProviderSecrets: () => Promise<void>

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
        if (Object.prototype.hasOwnProperty.call(updates, 'apiKey')) {
          mergeProtectedCredential(webSearchCredentialName(id), {
            apiKey: updates.apiKey || null,
          }).catch((error) => {
            console.warn(`[websearch] Unable to protect API key for "${id}":`, error)
          })
        }
      },

      hydrateProviderSecrets: async () => {
        const current = get().providers
        const hydrated = [...current]
        await Promise.all(current.map(async (provider, index) => {
          try {
            const credential = await readProtectedCredential(webSearchCredentialName(provider.id))
            const protectedKey = typeof credential.apiKey === 'string' ? credential.apiKey : ''
            if (protectedKey) {
              hydrated[index] = { ...provider, apiKey: protectedKey }
            } else if (provider.apiKey) {
              // One-time migration from legacy localStorage plaintext.
              await mergeProtectedCredential(webSearchCredentialName(provider.id), {
                apiKey: provider.apiKey,
              })
            }
          } catch (error) {
            console.warn(`[websearch] Unable to load protected API key for "${provider.id}":`, error)
          }
        }))
        set({ providers: hydrated })
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
        providers: redactWebSearchProviders(state.providers),
        maxResults: state.maxResults,
      }),
    }
  )
)
