// Web Search Provider Abstraction for pi-server
// Default: Bing (zero-config, works in China)
// Optional: Brave, SearxNG, Tavily

const SEARCH_TIMEOUT = 15_000
const FETCH_TIMEOUT = 20_000

// ─── Result types ───────────────────────────────────────

class SearchResult {
  constructor({ title, url, description, position }) {
    this.title = title || ''
    this.url = url || ''
    this.description = description || ''
    this.position = position || 0
  }
}

// ─── Bing (default, zero-config, works in China) ────────

/**
 * Bing search — scrapes cn.bing.com HTML search results.
 * No API key required. Accessible in China.
 */
async function searchBing(query, limit = 5) {
  const url = `https://cn.bing.com/search?q=${encodeURIComponent(query)}&count=${limit}`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT),
  })

  const html = await res.text()
  const results = []

  // Bing uses <li class="b_algo"> for each result
  const liRegex = /<li[^>]*class="[^"]*b_algo[^"]*"[^>]*>([\s\S]*?)<\/li>/gi
  let liMatch
  while ((liMatch = liRegex.exec(html)) !== null && results.length < limit) {
    const item = liMatch[1]

    const linkMatch = item.match(/<h2[^>]*>.*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i)
    if (!linkMatch) continue

    const url = linkMatch[1]
    const title = linkMatch[2].replace(/<[^>]+>/g, '').trim()
    if (!url || !title || url.startsWith('#') || url.includes('javascript:')) continue

    const snippetMatch = item.match(/<p[^>]*class="[^"]*b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/i)
      || item.match(/<div[^>]*class="b_caption"[^>]*>.*?<p[^>]*>([\s\S]*?)<\/p>/i)
    const description = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : ''

    results.push(new SearchResult({ title, url, description, position: results.length + 1 }))
  }

  return results
}

// ─── Brave Search ───────────────────────────────────────

async function searchBrave(query, apiKey, limit = 5) {
  if (!apiKey) {
    throw new Error('Brave Search requires an API key. Get one at https://brave.com/search/api/')
  }

  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(Math.min(limit, 20)))
  url.searchParams.set('offset', '0')

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT),
  })

  if (!response.ok) {
    throw new Error(`Brave API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  const results = (data.web?.results || []).slice(0, limit)

  return results.map((r, i) => new SearchResult({
    title: r.title || '',
    url: r.url || '',
    description: r.description || '',
    position: i + 1,
  }))
}

// ─── SearXNG ────────────────────────────────────────────

async function searchSearxng(query, baseUrl, limit = 5) {
  if (!baseUrl) {
    throw new Error('SearXNG requires a server URL. Set up at https://docs.searxng.org')
  }

  const cleanUrl = baseUrl.replace(/\/+$/, '')
  const params = new URLSearchParams({ q: query, format: 'json', pageno: '1' })

  const response = await fetch(`${cleanUrl}/search?${params.toString()}`, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT),
  })

  if (!response.ok) {
    throw new Error(`SearXNG error: ${response.status}`)
  }

  const data = await response.json()
  const raw = (data.results || []).slice(0, limit)

  return raw.map((r, i) => new SearchResult({
    title: r.title || '',
    url: r.url || '',
    description: r.content || '',
    position: i + 1,
  }))
}

// ─── Tavily ────────────────────────────────────────────

async function searchTavily(query, apiKey, limit = 5) {
  if (!apiKey) {
    throw new Error('Tavily requires an API key. Get one at https://tavily.com')
  }

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, max_results: Math.min(limit, 20) }),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT),
  })

  if (!response.ok) {
    throw new Error(`Tavily API error: ${response.status}`)
  }

  const data = await response.json()
  const results = (data.results || []).slice(0, limit)

  return results.map((r, i) => new SearchResult({
    title: r.title || '',
    url: r.url || '',
    description: r.content || '',
    position: i + 1,
  }))
}

// ─── Web Fetch (read URL content) ───────────────────────

/**
 * Fetch a URL and return its content as readable text.
 * Strips HTML tags, extracts main content.
 */
async function fetchUrl(url) {
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    return { error: 'Invalid URL. Must start with http:// or https://' }
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })

    if (!res.ok) {
      return { error: `HTTP ${res.status}: ${res.statusText}` }
    }

    const contentType = res.headers.get('content-type') || ''
    const text = await res.text()

    // If it's HTML, strip tags and extract readable content
    if (contentType.includes('text/html')) {
      // Remove scripts, styles, nav, footer
      const cleaned = text
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        // Replace block-level tags with newlines
        .replace(/<\/?(?:div|p|h[1-6]|li|tr|br|blockquote|section|article)[^>]*>/gi, '\n')
        // Replace remaining tags with nothing
        .replace(/<[^>]*>/g, '')
        // Decode common entities
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(c))
        // Collapse multiple newlines
        .replace(/\n{4,}/g, '\n\n')
        .replace(/^\s+|\s+$/gm, '')
        .trim()

      // Limit to ~8000 chars to avoid context overflow
      const truncated = cleaned.length > 8000
        ? cleaned.slice(0, 8000) + '\n\n... [content truncated]'
        : cleaned

      return { content: truncated, url }
    }

    // Plain text or XML
    const truncated = text.length > 8000
      ? text.slice(0, 8000) + '\n\n... [content truncated]'
      : text
    return { content: truncated, url }
  } catch (err) {
    return { error: `Failed to fetch ${url}: ${err.message || String(err)}` }
  }
}

// ─── Provider registry ──────────────────────────────────

const PROVIDERS = {
  bing: {
    name: 'Bing',
    description: 'Free, no API key required. Works well in China via cn.bing.com. Default provider.',
    needsConfig: false,
    search: searchBing,
  },
  brave: {
    name: 'Brave Search',
    description: 'Free tier: 2,000 queries/month. Requires API key.',
    needsConfig: true,
    requiredFields: ['apiKey'],
    search: searchBrave,
  },
  searxng: {
    name: 'SearXNG',
    description: 'Self-hosted metasearch engine. Requires server URL.',
    needsConfig: true,
    requiredFields: ['apiUrl'],
    search: searchSearxng,
  },
  tavily: {
    name: 'Tavily',
    description: 'Free tier: 1,000 queries/month. Requires API key.',
    needsConfig: true,
    requiredFields: ['apiKey'],
    search: searchTavily,
  },
}

function listProviders() {
  return Object.entries(PROVIDERS).map(([id, p]) => ({
    id,
    name: p.name,
    description: p.description,
    needsConfig: p.needsConfig,
    requiredFields: p.requiredFields || [],
  }))
}

/**
 * Perform a web search using the configured provider.
 *
 * @param {string} query - Search query
 * @param {object} [config] - Provider configuration
 * @param {string} [config.provider] - Provider ID (default: 'bing')
 * @param {string} [config.apiKey] - API key for Brave/Tavily
 * @param {string} [config.apiUrl] - URL for SearXNG
 * @param {number} [config.limit] - Max results
 * @returns {Promise<{results: SearchResult[], error?: string}>}
 */
async function webSearch(query, config = {}) {
  const providerId = config?.provider || 'bing'
  const provider = PROVIDERS[providerId]

  if (!provider) {
    return {
      results: [],
      error: `Unknown search provider: ${providerId}. Available: ${Object.keys(PROVIDERS).join(', ')}`,
    }
  }

  try {
    const limit = Math.max(1, Math.min(config?.limit || 5, 20))
    let results

    switch (providerId) {
      case 'bing':
        results = await searchBing(query, limit)
        break
      case 'brave':
        results = await searchBrave(query, config.apiKey, limit)
        break
      case 'searxng':
        results = await searchSearxng(query, config.apiUrl, limit)
        break
      case 'tavily':
        results = await searchTavily(query, config.apiKey, limit)
        break
      default:
        results = await searchBing(query, limit)
    }

    return { results }
  } catch (err) {
    return {
      results: [],
      error: `Search (${providerId}) failed: ${err.message || String(err)}`,
    }
  }
}

export { webSearch, fetchUrl, listProviders, SearchResult }
