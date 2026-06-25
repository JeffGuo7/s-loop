// Web Search Provider Abstraction for pi-server
// Default: Bing (puppeteer-core + cheerio parsing, same approach as Cherry Studio)
// Optional: Brave, SearxNG, Tavily, Exa

import * as cheerio from 'cheerio'
import * as fs from 'node:fs'
import * as os from 'node:os'
import { launch } from 'puppeteer-core'

const BROWSER_LAUNCH_TIMEOUT = 15_000
const PAGE_LOAD_TIMEOUT = 20_000
const RESULT_WAIT_TIMEOUT = 10_000
const FETCH_TIMEOUT = 20_000
const SEARCH_TIMEOUT = 15_000

// ─── Browser detection (cross-platform) ──────────────────

function getBrowserCandidates() {
  const platform = os.platform()

  if (platform === 'win32') {
    return [
      { name: 'Edge', path: `${process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)'}/Microsoft/Edge/Application/msedge.exe` },
      { name: 'Edge', path: `${process.env.ProgramFiles || 'C:/Program Files'}/Microsoft/Edge/Application/msedge.exe` },
      { name: 'Chrome', path: `${process.env.LOCALAPPDATA || (process.env.USERPROFILE + '/AppData/Local')}/Google/Chrome/Application/chrome.exe` },
      { name: 'Chrome', path: `${process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)'}/Google/Chrome/Application/chrome.exe` },
      { name: 'Chrome', path: `${process.env.ProgramFiles || 'C:/Program Files'}/Google/Chrome/Application/chrome.exe` },
      { name: 'Firefox', path: `${process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)'}/Mozilla Firefox/firefox.exe` },
      { name: 'Firefox', path: `${process.env.ProgramFiles || 'C:/Program Files'}/Mozilla Firefox/firefox.exe` },
    ]
  }

  if (platform === 'darwin') {
    return [
      { name: 'Chrome', path: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
      { name: 'Edge', path: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' },
      { name: 'Firefox', path: '/Applications/Firefox.app/Contents/MacOS/firefox' },
      { name: 'Chromium', path: '/Applications/Chromium.app/Contents/MacOS/Chromium' },
    ]
  }

  // Linux
  return [
    { name: 'Chrome', path: '/usr/bin/google-chrome-stable' },
    { name: 'Chrome', path: '/usr/bin/google-chrome' },
    { name: 'Chromium', path: '/usr/bin/chromium-browser' },
    { name: 'Chromium', path: '/usr/bin/chromium' },
    { name: 'Edge', path: '/usr/bin/microsoft-edge' },
    { name: 'Firefox', path: '/usr/bin/firefox' },
  ]
}

function findBrowser() {
  const candidates = getBrowserCandidates()
  for (const { name, path } of candidates) {
    if (fs.existsSync(path)) {
      console.log(`[webSearch] found ${name}: ${path}`)
      return { name, path }
    }
  }
  console.warn('[webSearch] no browser found')
  return null
}

// ─── Browser pool ────────────────────────────────────────
// Single browser reused across searches for speed.
// Liveness checked via CDP probe (browser.version()) — not just exitCode,
// which misses zombie processes where the OS sees the process as alive
// but the DevTools protocol is unresponsive.

let _browser = null

async function getBrowser() {
  if (_browser) {
    let alive = false
    try {
      const proc = _browser.process()
      if (proc && proc.exitCode == null) {
        // Process is alive — but is it responsive? Probe via CDP.
        await Promise.race([
          _browser.version(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('liveness timeout')), 3_000)),
        ])
        alive = true
      }
    } catch {
      console.warn('[webSearch] browser liveness check failed, restarting')
    }
    if (!alive) {
      try { await _browser.close() } catch {}
      _browser = null
    }
  }

  if (!_browser) {
    const info = findBrowser()
    if (!info) return null

    _browser = await launch({
      executablePath: info.path,
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1280,768'],
      timeout: BROWSER_LAUNCH_TIMEOUT,
    })

    process.once('exit', () => { try { _browser?.close() } catch {} })
    console.log('[webSearch] browser launched:', info.path)
  }

  return _browser
}

// ─── Search (matches MFG-A approach) ────────────────────
// URL: www.bing.com, UA: Chrome 120 + Edg, wait: load + 2000ms
// Parser: #b_results h2 a, polling for #b_results before content read

async function fetchWithBrowser(url) {
  const browser = await getBrowser()
  if (!browser) return null

  let page
  try {
    page = await browser.newPage()

    // MFG-A UA: Chrome 120 Windows + Edg suffix
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
    )

    // MFG-A: did-stop-loading = load, then 2000ms hydration delay
    await page.goto(url, { waitUntil: 'load', timeout: PAGE_LOAD_TIMEOUT })
    await new Promise(r => setTimeout(r, 2000))

    // MFG-A: poll for #b_results selector before reading content
    await page.waitForSelector('#b_results', { timeout: RESULT_WAIT_TIMEOUT })

    const html = await page.content()
    return html
  } catch (err) {
    console.warn(`[webSearch] fetch failed: ${err.message.split('\n')[0]}`)
    return null
  } finally {
    if (page) await page.close().catch(() => {})
  }
}

async function searchBing(query, limit = 5) {
  console.log(`[webSearch] query: ${JSON.stringify(query)}`)

  // MFG-A URL: www.bing.com
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`

  const html = await fetchWithBrowser(url)
  if (!html) {
    throw new Error('Browser search failed — no browser available or page load error.')
  }

  const results = parseBingHtml(html, limit)
  console.log(`[webSearch] parsed ${results.length} results, first: ${JSON.stringify(results[0]?.title?.slice(0, 40))}`)
  if (results.length === 0) {
    throw new Error('No results parsed from search page.')
  }
  return results
}

// ─── Bing HTML parsing ──────────────────────────────────

function parseBingHtml(html, limit) {
  const $ = cheerio.load(html)
  const results = []

  $('#b_results h2').each((_, h2) => {
    if (results.length >= limit) return false
    const $a = $(h2).find('a').first()
    const rawUrl = $a.attr('href') || ''
    const title = $a.text().trim()
    if (!title || !rawUrl) return
    const url = decodeBingRedirect(rawUrl)
    if (!url.startsWith('http')) return
    results.push(new SearchResult({ title, url, description: '', position: results.length + 1 }))
  })

  return results
}

// Bing wraps real URLs in /ck/a?...u=a1<base64>
function decodeBingRedirect(bingUrl) {
  if (!bingUrl.includes('bing.com/ck/') && !bingUrl.includes('/ck/a?')) return bingUrl
  try {
    const u = new URL(bingUrl, 'https://www.bing.com').searchParams.get('u')
    if (!u) return bingUrl
    const b64 = u.startsWith('a1') ? u.slice(2) : u
    const decoded = atob(b64)
    return decoded.startsWith('http') ? decoded : bingUrl
  } catch { return bingUrl }
}

// ─── Brave Search ───────────────────────────────────────

async function searchBrave(query, apiKey, limit = 5) {
  if (!apiKey) throw new Error('Brave Search requires an API key. Get one at https://brave.com/search/api/')

  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(Math.min(limit, 20)))
  url.searchParams.set('offset', '0')

  const response = await fetch(url.toString(), {
    headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': apiKey },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT),
  })

  if (!response.ok) throw new Error(`Brave API error: ${response.status}`)

  const data = await response.json()
  return (data.web?.results || []).slice(0, limit).map((r, i) =>
    new SearchResult({ title: r.title || '', url: r.url || '', description: r.description || '', position: i + 1 }))
}

// ─── SearXNG ────────────────────────────────────────────

async function searchSearxng(query, baseUrl, limit = 5) {
  if (!baseUrl) throw new Error('SearXNG requires a server URL.')

  const cleanUrl = baseUrl.replace(/\/+$/, '')
  const params = new URLSearchParams({ q: query, format: 'json', pageno: '1' })

  const response = await fetch(`${cleanUrl}/search?${params.toString()}`, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT),
  })

  if (!response.ok) throw new Error(`SearXNG error: ${response.status}`)

  const data = await response.json()
  return (data.results || []).slice(0, limit).map((r, i) =>
    new SearchResult({ title: r.title || '', url: r.url || '', description: r.content || '', position: i + 1 }))
}

// ─── Tavily ────────────────────────────────────────────

async function searchTavily(query, apiKey, limit = 5) {
  if (!apiKey) throw new Error('Tavily requires an API key.')

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, max_results: Math.min(limit, 20) }),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT),
  })

  if (!response.ok) throw new Error(`Tavily API error: ${response.status}`)

  const data = await response.json()
  return (data.results || []).slice(0, limit).map((r, i) =>
    new SearchResult({ title: r.title || '', url: r.url || '', description: r.content || '', position: i + 1 }))
}

// ─── Exa ────────────────────────────────────────────────

async function searchExa(query, apiKey, limit = 5) {
  if (!apiKey) throw new Error('Exa Search requires an API key.')

  const response = await fetch(`https://mcp.exa.ai/mcp?exaApiKey=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'web_search_exa', arguments: { query, type: 'auto', numResults: Math.min(limit, 10), livecrawl: 'fallback', contextMaxCharacters: 3000 } },
    }),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT),
  })

  const text = await response.text()
  const results = []
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue
    try {
      const data = JSON.parse(line.slice(6))
      const content = data?.result?.content
      if (!Array.isArray(content)) continue
      const fullText = content.find(c => c.type === 'text')?.text || ''
      if (!fullText) continue
      for (const block of fullText.split(/(?=\[\d+\])/).filter(Boolean)) {
        const titleMatch = block.match(/^\[\d+\]\s*(.+?)(?:\n|$)/)
        const urlMatch = block.match(/https?:\/\/[^\s\n]+/)
        if (titleMatch && urlMatch) {
          results.push(new SearchResult({ title: titleMatch[1].trim(), url: urlMatch[0].trim(), description: block.split('\n').filter(l => !l.includes(urlMatch[0])).join('\n').trim(), position: results.length + 1 }))
        }
      }
    } catch {}
  }
  return results.slice(0, limit)
}

// ─── Web Fetch ──────────────────────────────────────────

async function fetchUrl(url) {
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
    return { error: 'Invalid URL.' }
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })

    if (!res.ok) return { error: `HTTP ${res.status}` }

    const contentType = res.headers.get('content-type') || ''
    const text = await res.text()

    if (contentType.includes('text/html')) {
      const cleaned = text
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<\/?(?:div|p|h[1-6]|li|tr|br|blockquote|section|article)[^>]*>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(c))
        .replace(/\n{4,}/g, '\n\n')
        .replace(/^\s+|\s+$/gm, '')
        .trim()
      const truncated = cleaned.length > 8000 ? cleaned.slice(0, 8000) + '\n\n...' : cleaned
      return { content: truncated, url }
    }

    const truncated = text.length > 8000 ? text.slice(0, 8000) + '\n\n...' : text
    return { content: truncated, url }
  } catch (err) {
    return { error: `Failed to fetch: ${err.message}` }
  }
}

// ─── Types ──────────────────────────────────────────────

class SearchResult {
  constructor({ title, url, description, position }) {
    this.title = title || ''
    this.url = url || ''
    this.description = description || ''
    this.position = position || 0
  }
}

// ─── Provider registry ──────────────────────────────────

const PROVIDERS = {
  bing: { name: 'Bing', description: 'Free. Uses browser (Chrome/Edge/Firefox).', needsConfig: false, search: searchBing },
  brave: { name: 'Brave Search', description: 'Free tier: 2,000 queries/month. Requires API key.', needsConfig: true, requiredFields: ['apiKey'], search: searchBrave },
  searxng: { name: 'SearXNG', description: 'Self-hosted metasearch engine. Requires server URL.', needsConfig: true, requiredFields: ['apiUrl'], search: searchSearxng },
  tavily: { name: 'Tavily', description: 'Free tier: 1,000 queries/month. Requires API key.', needsConfig: true, requiredFields: ['apiKey'], search: searchTavily },
  exa: { name: 'Exa Search', description: 'AI-native search via MCP. Free tier: 1,000 queries/month.', needsConfig: true, requiredFields: ['apiKey'], search: searchExa },
}

function listProviders() {
  return Object.entries(PROVIDERS).map(([id, p]) => ({ id, name: p.name, description: p.description, needsConfig: p.needsConfig, requiredFields: p.requiredFields || [] }))
}

async function webSearch(query, config = {}) {
  const providerId = config?.provider || 'bing'
  const provider = PROVIDERS[providerId]

  if (!provider) {
    return { results: [], error: `Unknown provider: ${providerId}. Available: ${Object.keys(PROVIDERS).join(', ')}` }
  }

  try {
    const limit = Math.max(1, Math.min(config?.limit || 5, 20))
    let results

    switch (providerId) {
      case 'bing': results = await searchBing(query, limit); break
      case 'brave': results = await searchBrave(query, config.apiKey, limit); break
      case 'searxng': results = await searchSearxng(query, config.apiUrl, limit); break
      case 'tavily': results = await searchTavily(query, config.apiKey, limit); break
      case 'exa': results = await searchExa(query, config.apiKey, limit); break
      default: results = await searchBing(query, limit)
    }

    return { results }
  } catch (err) {
    return { results: [], error: `Search (${providerId}) failed: ${err.message}` }
  }
}

export { webSearch, fetchUrl, listProviders, SearchResult }
