export type WebSearchProviderId = 'bing' | 'brave' | 'searxng' | 'tavily' | 'exa'

export interface WebSearchProviderConfig {
  id: WebSearchProviderId
  name: string
  description: string
  needsConfig: boolean
  requiredFields: string[]
  enabled: boolean
  apiKey?: string
  apiUrl?: string
}

export interface WebSearchConfig {
  /** Provider ID */
  provider: WebSearchProviderId
  /** API key for Brave / Tavily */
  apiKey?: string
  /** Server URL for SearXNG */
  apiUrl?: string
  /** Max results (1-20) */
  limit?: number
}

export const WEB_SEARCH_PROVIDERS: WebSearchProviderConfig[] = [
  {
    id: 'bing',
    name: 'Bing',
    description: 'Free, no API key required. Works well in China via cn.bing.com. Default provider.',
    needsConfig: false,
    requiredFields: [],
    enabled: true,
  },
  {
    id: 'brave',
    name: 'Brave Search',
    description: 'Free tier: 2,000 queries/month. Get API key at https://brave.com/search/api/',
    needsConfig: true,
    requiredFields: ['apiKey'],
    enabled: false,
    apiKey: '',
  },
  {
    id: 'searxng',
    name: 'SearXNG',
    description: 'Self-hosted metasearch engine. Requires a SearXNG instance URL.',
    needsConfig: true,
    requiredFields: ['apiUrl'],
    enabled: false,
    apiUrl: '',
  },
  {
    id: 'tavily',
    name: 'Tavily',
    description: 'Free tier: 1,000 queries/month. Get API key at https://tavily.com',
    needsConfig: true,
    requiredFields: ['apiKey'],
    enabled: false,
    apiKey: '',
  },
  {
    id: 'exa',
    name: 'Exa Search',
    description: 'AI-native search engine. Free tier 1,000 queries/month. Get key at https://exa.ai',
    needsConfig: true,
    requiredFields: ['apiKey'],
    enabled: false,
    apiKey: '',
  },
]
