// Web Search Provider Abstraction for pi-server
// Default: Bing (zero-config, works in China)
// Optional: Brave, SearxNG, Tavily

import * as cheerio from 'cheerio'

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

async function searchBing(query, limit = 5) {
  const url = `https://cn.bing.com/search?q=${encodeURIComponent(query)}&count=${limit}`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.9',
    },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT),
  })

  const html = await res.text()
  const $ = cheerio.load(html)
  const results = []

  const els = $('#b_results .b_algo').length
    ? $('#b_results .b_algo')
    : $('.b_algo').length ? $('.b_algo') : $('li.b_algo')

  els.each((_, el) => {
    if (results.length >= limit) return false
    const $a = $(el).find('h2 a').first()
    const rawUrl = $a.attr('href') || ''
    const title = $a.text().trim()
    if (!title || !rawUrl || rawUrl.startsWith('#') || rawUrl.includes('javascript:')) return
    const decodedUrl = decodeBingUrl(rawUrl)
    const desc = $(el).find('.b_caption p, .b_lineclamp1, .b_lineclamp2, .b_lineclamp3, .b_caption div').first().text().trim()
    results.push(new SearchResult({ title, url: decodedUrl, description: desc, position: results.length + 1 }))
  })

  return results
}

/** Decode Bing redirect URL (ck/a?...&u=...) → real URL */
function decodeBingUrl(bingUrl) {
  if (!bingUrl.includes('bing.com/ck/') && !bingUrl.includes('/ck/a?')) return bingUrl
  try {
    const u = new URL(bingUrl, 'https://www.bing.com').searchParams.get('u')
    if (!u) return bingUrl
    const b64 = u.startsWith('a1') ? u.slice(2) : u
    const decoded = atob(b64)
    if (decoded.startsWith('http')) return decoded
    return bingUrl
  } catch { return bingUrl }
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

// ─── Exa (via MCP protocol) ─────────────────────────────

/**
 * Exa AI-native search via MCP protocol (like Kilocode/OpenCode uses).
 * Requires API key from https://exa.ai (free tier: 1000 queries/month).
 * Far more reliable than Bing HTML scraping for Chinese search queries.
 */
async function searchExa(query, apiKey, limit = 5) {
  if (!apiKey) {
    throw new Error('Exa Search requires an API key. Get one at https://exa.ai')
  }

  const response = await fetch(`https://mcp.exa.ai/mcp?exaApiKey=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'web_search_exa',
        arguments: {
          query,
          type: 'auto',
          numResults: Math.min(limit, 10),
          livecrawl: 'fallback',
          contextMaxCharacters: 3000,
        },
      },
    }),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT),
  })

  const text = await response.text()
  const results = []

  // Parse SSE response from Exa
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue
    try {
      const data = JSON.parse(line.slice(6))
      const content = data?.result?.content
      if (!Array.isArray(content)) continue

      const fullText = content.find(c => c.type === 'text')?.text || ''
      if (!fullText) continue

      // Exa returns formatted results with [number] format
      const blocks = fullText.split(/(?=\[\d+\])/).filter(Boolean)
      for (const block of blocks) {
        const titleMatch = block.match(/^\[\d+\]\s*(.+?)(?:\n|$)/)
        const urlMatch = block.match(/https?:\/\/[^\s\n]+/)
        const title = titleMatch ? titleMatch[1].trim() : ''
        const url = urlMatch ? urlMatch[0].trim() : ''
        // Everything after the URL line is the content
        const contentLines = block.split('\n').filter(l => !l.includes(url))
        const description = contentLines.join('\n').trim()

        if (title && url) {
          results.push(new SearchResult({ title, url, description, position: results.length + 1 }))
        }
      }
    } catch { /* skip unparseable lines */ }
  }

  return results.slice(0, limit)
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
  exa: {
    name: 'Exa Search',
    description: 'AI-native search via MCP. Free tier: 1,000 queries/month. Requires API key.',
    needsConfig: true,
    requiredFields: ['apiKey'],
    search: searchExa,
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
      case 'exa':
        results = await searchExa(query, config.apiKey, limit)
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
