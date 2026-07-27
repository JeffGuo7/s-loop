/**
 * MCP client manager for remote servers.
 *
 * Remote MCP transport rules:
 *   1. Prefer modern Streamable HTTP.
 *   2. Fall back to legacy HTTP+SSE when the endpoint rejects Streamable HTTP.
 *
 * The official MCP SDK owns JSON-RPC framing, session IDs, SSE parsing,
 * reconnection, pagination and protocol-version negotiation. Keeping this
 * module focused on lifecycle and pi-agent tool adaptation prevents the
 * desktop app from having to know transport details.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'

const connections = new Map()

function normalizeHeaders(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers)
      .filter(([key, value]) => typeof key === 'string' && typeof value === 'string')
      .map(([key, value]) => [key, value])
  )
}

function fetchWithHeaders(headers) {
  const customHeaders = normalizeHeaders(headers)
  return async (input, init = {}) => {
    const merged = new Headers(init.headers || {})
    for (const [key, value] of Object.entries(customHeaders)) merged.set(key, value)
    return globalThis.fetch(input, { ...init, headers: merged })
  }
}

function makeClient() {
  const client = new Client(
    { name: 's-loop', version: '1.0.0' },
    { capabilities: {} }
  )
  client.onerror = (error) => {
    console.warn(`[mcp] remote client error: ${error?.message || error}`)
  }
  return client
}

function makeStreamableTransport(url, headers) {
  return new StreamableHTTPClientTransport(new URL(url), {
    fetch: fetchWithHeaders(headers),
  })
}

function makeSseTransport(url, headers) {
  const fetch = fetchWithHeaders(headers)
  return new SSEClientTransport(new URL(url), {
    eventSourceInit: { fetch },
    requestInit: {},
    fetch,
  })
}

async function closeTransport(transport) {
  try {
    if (typeof transport.terminateSession === 'function') {
      await transport.terminateSession()
    }
  } catch {
    // Some servers do not implement DELETE/terminate-session.
  }
  try {
    await transport.close()
  } catch {
    // The connection may already be closed after a failed handshake.
  }
}

async function listAll(client, method) {
  const items = []
  let cursor
  do {
    const result = method === 'tools'
      ? await client.listTools(cursor ? { cursor } : undefined)
      : await client.listResources(cursor ? { cursor } : undefined)
    items.push(...(result[method] || []))
    cursor = result.nextCursor
  } while (cursor)
  return items
}

async function discover(client) {
  const tools = await listAll(client, 'tools')
  let resources = []
  try {
    resources = await listAll(client, 'resources')
  } catch (error) {
    // A server may expose tools without resources/list.
    console.warn(`[mcp] resources/list unavailable: ${error?.message || error}`)
  }
  return { tools, resources }
}

async function connectWithTransport(name, transport, transportType) {
  const client = makeClient()
  try {
    await client.connect(transport)
    const { tools, resources } = await discover(client)
    const connection = {
      name,
      client,
      transport,
      transportType,
      tools,
      resources,
      serverInfo: client.getServerVersion?.() || null,
    }
    connections.set(name, connection)
    console.log(`[mcp] "${name}" connected via ${transportType}; ${tools.length} tool(s)`)
    return connection
  } catch (error) {
    await closeTransport(transport)
    throw error
  }
}

/**
 * Connect to a remote MCP server.
 *
 * `preferredTransport` is only a hint for imported configs. `sse` forces the
 * legacy transport; `http` and omitted values use modern-first fallback.
 */
export async function connectSseMcpServer(name, url, headers = {}, preferredTransport = 'http') {
  if (!name || !url) throw new Error('MCP server name and URL are required')
  if (!/^https?:\/\//i.test(url)) throw new Error(`Unsupported MCP URL: ${url}`)

  await disconnectSseMcpServer(name)
  const safeHeaders = normalizeHeaders(headers)

  if (preferredTransport === 'sse') {
    try {
      const connection = await connectWithTransport(name, makeSseTransport(url, safeHeaders), 'sse')
      return serializeConnection(connection)
    } catch (error) {
      throw new Error(`Legacy SSE connection failed for "${name}": ${error?.message || error}`)
    }
  }

  let modernError
  try {
    const connection = await connectWithTransport(name, makeStreamableTransport(url, safeHeaders), 'streamable-http')
    return serializeConnection(connection)
  } catch (error) {
    modernError = error
    console.warn(`[mcp] Streamable HTTP failed for "${name}", trying legacy SSE: ${error?.message || error}`)
  }

  try {
    const connection = await connectWithTransport(name, makeSseTransport(url, safeHeaders), 'sse')
    return serializeConnection(connection)
  } catch (sseError) {
    throw new Error(
      `Remote MCP connection failed for "${name}". ` +
      `Streamable HTTP: ${modernError?.message || modernError}; ` +
      `legacy SSE: ${sseError?.message || sseError}`
    )
  }
}

function serializeTool(tool) {
  return {
    name: tool.name || 'unknown',
    description: tool.description || '',
    inputSchema: tool.inputSchema || {},
  }
}

function serializeResource(resource) {
  return {
    name: resource.name || resource.title || resource.uri || 'resource',
    uri: resource.uri || '',
    description: resource.description || '',
    mimeType: resource.mimeType || '',
  }
}

function serializeConnection(connection) {
  return {
    transport: connection.transportType,
    tools: connection.tools.map(serializeTool),
    resources: connection.resources.map(serializeResource),
    serverInfo: connection.serverInfo,
  }
}

export async function disconnectSseMcpServer(name) {
  const connection = connections.get(name)
  if (!connection) return
  connections.delete(name)
  await closeTransport(connection.transport)
  console.log(`[mcp] "${name}" disconnected`)
}

export async function callSseMcpTool(serverName, toolName, args) {
  const connection = connections.get(serverName)
  if (!connection) throw new Error(`Remote MCP server "${serverName}" is not connected`)
  try {
    return await connection.client.callTool({
      name: toolName,
      arguments: args || {},
    })
  } catch (error) {
    throw new Error(`MCP tool call "${serverName}/${toolName}" failed: ${error?.message || error}`)
  }
}

export function getAllSseMcpTools() {
  const all = []
  for (const [serverName, connection] of connections) {
    const safeServerName = serverName.replace(/[^a-zA-Z0-9]/g, '_')
    for (const tool of connection.tools) {
      const toolName = tool.name
      all.push({
        name: `mcp_sse_${safeServerName}_${toolName}`,
        label: `${serverName}/${toolName}`,
        description: tool.description || `${serverName} MCP tool: ${toolName}`,
        parameters: tool.inputSchema || { type: 'object', properties: {} },
        _mcpServer: serverName,
        _mcpToolName: toolName,
        executionMode: 'parallel',
        execute: async (_toolCallId, params) => {
          try {
            const result = await callSseMcpTool(serverName, toolName, params)
            return {
              content: result?.content || [{ type: 'text', text: JSON.stringify(result, null, 2) }],
              details: result,
              ...(result?.isError ? { isError: true } : {}),
            }
          } catch (error) {
            return {
              content: [{ type: 'text', text: `Error: ${error?.message || error}` }],
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

export function getSseMcpStatus() {
  return [...connections.values()].map((connection) => ({
    name: connection.name,
    connected: true,
    status: 'connected',
    transport: connection.transportType,
    tools: connection.tools.map(serializeTool),
    resources: connection.resources.map(serializeResource),
    serverInfo: connection.serverInfo,
  }))
}

export function isSseMcpConnected(name) {
  return connections.has(name)
}

export function disconnectAllSseMcp() {
  for (const name of connections.keys()) disconnectSseMcpServer(name).catch(() => {})
}
