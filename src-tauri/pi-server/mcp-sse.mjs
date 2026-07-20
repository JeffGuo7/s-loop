/**
 * mcp-sse.mjs — SSE MCP transport for pi-server
 *
 * Manages connections to SSE-based MCP servers (remote HTTP endpoints
 * using Server-Sent Events for server→client and POST for client→server).
 *
 * Each connection:
 *  1. Connects to the SSE endpoint
 *  2. Receives the "endpoint" event for the POST URL
 *  3. Sends initialize via POST
 *  4. Discovers tools via tools/list
 *  5. Exposes tool definitions that can be merged into the agent's tool list
 *
 * Tool calls are handled directly in pi-server via HTTP POST to the MCP endpoint.
 */

import * as http from 'node:http'
import * as https from 'node:https'

// ── State ────────────────────────────────────────────────────

const connections = new Map()  // name → { tools, endpoint, sseAbort, sseReq }

// ── HTTP helpers ─────────────────────────────────────────────

const AGENT = 's-loop/1.0'

function buildUrl(base, path) {
  const u = new URL(base)
  // If the base already has a path, replace it; otherwise append
  if (path) {
    u.pathname = path
  }
  return u.toString()
}

function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const isHttps = urlObj.protocol === 'https:'
    const mod = isHttps ? https : http

    const defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'User-Agent': AGENT,
    }

    // Merge custom headers (from user config) with defaults
    const reqHeaders = { ...defaultHeaders, ...options.headers }

    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: reqHeaders,
      timeout: options.timeout || 30000,
      rejectUnauthorized: options.rejectUnauthorized !== false,
    }

    const req = mod.request(reqOptions, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8')
        resolve({ statusCode: res.statusCode, headers: res.headers, body })
      })
    })

    req.on('error', (err) => reject(err))
    req.on('timeout', () => { req.destroy(); reject(new Error(`Request timed out: ${url}`)) })

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body))
    }
    req.end()
  })
}

// ── MCP JSON-RPC helpers ─────────────────────────────────────

let requestId = 100

function nextId() {
  return ++requestId
}

function mcpRequest(endpoint, method, params) {
  const id = nextId()
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id,
    method,
    params: params || {},
  })
  return httpRequest(endpoint, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' },
  }).then((res) => {
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw new Error(`MCP request failed (${res.statusCode}): ${res.body}`)
    }
    let data
    try {
      data = JSON.parse(res.body)
    } catch {
      throw new Error(`Invalid JSON-RPC response from MCP server: ${res.body.slice(0, 200)}`)
    }
    if (data.error) {
      throw new Error(`MCP error (${data.error.code || 'unknown'}): ${data.error.message || JSON.stringify(data.error)}`)
    }
    return data.result || null
  })
}

// ── SSE connection ───────────────────────────────────────────

function sseConnect(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const isHttps = urlObj.protocol === 'https:'
    const mod = isHttps ? https : http

    const reqHeaders = {
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'User-Agent': AGENT,
      ...headers,
    }

    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: reqHeaders,
      timeout: 15000,
      rejectUnauthorized: true,
    }

    const req = mod.request(reqOptions, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`SSE connection failed (${res.statusCode})`))
        return
      }

      let endpoint = null
      let buffer = ''
      const abortController = new AbortController()

      res.on('data', (chunk) => {
        buffer += chunk.toString('utf-8')
        // Process SSE events
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''  // keep incomplete line

        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed.startsWith('event: ')) {
            const eventType = trimmed.slice(7)
            if (eventType === 'endpoint') {
              // Next line contains the POST endpoint URL
              // Look ahead in remaining lines
              const nextDataLine = lines[lines.indexOf(line) + 1] || ''
              if (nextDataLine.startsWith('data: ')) {
                endpoint = nextDataLine.slice(6).trim()
              }
            } else if (eventType === 'message') {
              // Standard MCP message over SSE — we handle these via POST
              // Ignore during sse init (we use POST for initialize)
            }
          }
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6)
            if (data === '[DONE]') continue
            // Parse as JSON to check for endpoint field
            try {
              const parsed = JSON.parse(data)
              if (parsed.endpoint) {
                endpoint = parsed.endpoint
              }
            } catch {}
          }
        }

        // If we found the endpoint, resolve
        if (endpoint) {
          resolve({ endpoint, abortController, req })
        }
      })

      res.on('end', () => {
        if (!endpoint) {
          // No endpoint received — try to use the original SSE URL as endpoint
          // Some SSE MCP servers use the same URL for both SSE and POST
          resolve({ endpoint: url, abortController, req })
        }
      })

      res.on('error', (err) => {
        reject(err)
      })
    })

    req.on('error', (err) => reject(err))
    req.on('timeout', () => { req.destroy(); reject(new Error(`SSE connect timeout: ${url}`)) })

    req.end()
  })
}

// ── Public API ───────────────────────────────────────────────

/**
 * Connect to an SSE MCP server.
 * @param {string} name - Server name/id
 * @param {string} url - SSE endpoint URL (e.g. https://example.com/mcp/sse)
 * @param {object} headers - Optional HTTP headers (e.g. Authorization)
 * @returns {Promise<{ tools: Array }>}
 */
export async function connectSseMcpServer(name, url, headers = {}) {
  // Disconnect existing connection if any
  if (connections.has(name)) {
    await disconnectSseMcpServer(name)
  }

  console.log(`[mcp-sse] connecting to "${name}" at ${url}`)

  // Step 1: Connect to SSE endpoint, discover POST endpoint
  let sseResult
  try {
    sseResult = await sseConnect(url, headers)
  } catch (err) {
    throw new Error(`SSE connect failed for "${name}": ${err.message}`)
  }

  const { endpoint: postEndpoint, abortController, req: sseReq } = sseResult
  console.log(`[mcp-sse] "${name}" SSE connected, POST endpoint: ${postEndpoint}`)

  // Step 2: Initialize via POST
  let serverInfo
  try {
    const result = await mcpRequest(postEndpoint, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 's-loop', version: '1.0.0' },
    })
    serverInfo = result
    console.log(`[mcp-sse] "${name}" initialized:`, JSON.stringify(result?.serverInfo || result))
  } catch (err) {
    abortController.abort()
    throw new Error(`Initialize failed for "${name}": ${err.message}`)
  }

  // Step 3: Send initialized notification (fire and forget)
  try {
    await mcpRequest(postEndpoint, 'notifications/initialized', {})
  } catch {
    // Notification is fire-and-forget, ignore errors
  }

  // Step 4: Discover tools
  let tools = []
  try {
    const result = await mcpRequest(postEndpoint, 'tools/list', {})
    tools = (result?.tools || []).map(t => ({
      name: t.name || 'unknown',
      description: t.description || '',
      inputSchema: t.inputSchema || {},
    }))
    console.log(`[mcp-sse] "${name}" discovered ${tools.length} tool(s):`, tools.map(t => t.name).join(', '))
  } catch (err) {
    console.warn(`[mcp-sse] "${name}" tools/list failed: ${err.message}`)
  }

  // Store connection
  connections.set(name, {
    endpoint: postEndpoint,
    tools,
    serverInfo,
    sseAbort: abortController,
    sseReq,
    headers,
  })

  return { tools, serverInfo }
}

/**
 * Disconnect from an SSE MCP server.
 */
export async function disconnectSseMcpServer(name) {
  const conn = connections.get(name)
  if (!conn) return

  console.log(`[mcp-sse] disconnecting "${name}"`)

  // Try graceful shutdown
  try {
    await mcpRequest(conn.endpoint, 'shutdown', {})
  } catch {}

  // Close SSE connection
  try { conn.sseAbort?.abort() } catch {}
  try { conn.sseReq?.destroy() } catch {}

  connections.delete(name)
  console.log(`[mcp-sse] "${name}" disconnected`)
}

/**
 * Call a tool on an SSE MCP server.
 */
export async function callSseMcpTool(serverName, toolName, args) {
  const conn = connections.get(serverName)
  if (!conn) throw new Error(`SSE MCP server "${serverName}" not connected`)

  console.log(`[mcp-sse] calling "${serverName}" / "${toolName}"`)
  try {
    const result = await mcpRequest(conn.endpoint, 'tools/call', {
      name: toolName,
      arguments: args || {},
    })
    return result
  } catch (err) {
    throw new Error(`MCP tool call "${serverName}/${toolName}" failed: ${err.message}`)
  }
}

/**
 * Get all tools from all connected SSE MCP servers.
 * Returns tool definitions compatible with pi-agent-core's tool format.
 */
export function getAllSseMcpTools() {
  const all = []

  for (const [name, conn] of connections) {
    for (const tool of conn.tools) {
      const toolName = tool.name
      // Sanitize server name for tool name: replace non-alphanumeric chars with underscore
      const safeServerName = name.replace(/[^a-zA-Z0-9]/g, '_')
      all.push({
        name: `mcp_sse_${safeServerName}_${toolName}`,
        label: `${name}/${toolName}`,
        description: tool.description || `${name} MCP tool: ${toolName}`,
        parameters: tool.inputSchema || { type: 'object', properties: {} },
        _mcpServer: name,
        _mcpToolName: toolName,
        executionMode: 'parallel',
        execute: async (_toolCallId, params, signal) => {
          try {
            const result = await callSseMcpTool(name, toolName, params)
            return {
              content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }],
              details: result,
            }
          } catch (err) {
            return {
              content: [{ type: 'text', text: `Error: ${err.message}` }],
              details: {},
              isError: true,
            }
          }
        },
      })
    }
  }

  return all
}

/**
 * Get the list of connected SSE MCP servers and their tools.
 */
export function getSseMcpStatus() {
  const list = []
  for (const [name, conn] of connections) {
    list.push({
      name,
      connected: true,
      tools: conn.tools.map(t => ({ name: t.name, description: t.description })),
      endpoint: conn.endpoint,
    })
  }
  return list
}

/**
 * Check if an SSE MCP server is connected.
 */
export function isSseMcpConnected(name) {
  return connections.has(name)
}

/**
 * Disconnect all SSE MCP servers.
 */
export function disconnectAllSseMcp() {
  for (const [name] of connections) {
    disconnectSseMcpServer(name).catch(() => {})
  }
}
