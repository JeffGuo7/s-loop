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
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js'
import { randomBytes } from 'node:crypto'

const connections = new Map()
const pendingAuth = new Map()
const oauthCredentialExports = new Map()
const OAUTH_FLOW_TTL_MS = 10 * 60 * 1000

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

function randomUrlSafe(size = 32) {
  return randomBytes(size).toString('base64url')
}

function compilePattern(pattern) {
  const escaped = String(pattern || '')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`, 'i')
}

export function filterMcpTools(tools, filter = {}) {
  const allow = Array.isArray(filter?.allow) ? filter.allow.filter(Boolean).map(compilePattern) : []
  const deny = Array.isArray(filter?.deny) ? filter.deny.filter(Boolean).map(compilePattern) : []
  return (Array.isArray(tools) ? tools : []).filter((tool) => {
    const name = String(tool?.name || '')
    if (deny.some((pattern) => pattern.test(name))) return false
    return allow.length === 0 || allow.some((pattern) => pattern.test(name))
  })
}

class SnotraOAuthProvider {
  constructor(config = {}) {
    const credentials = config.credentials || {}
    this._redirectUrl = config.redirectUrl
    this._state = randomUrlSafe()
    this._authorizationUrl = null
    this._codeVerifier = credentials.codeVerifier || ''
    this._tokens = credentials.tokens
    this._clientInformation = credentials.clientInformation
    this._discoveryState = credentials.discoveryState
    this._clientId = config.clientId || credentials.clientId
    this._clientSecret = credentials.clientSecret
    this._scopes = Array.isArray(config.scopes) ? config.scopes.filter(Boolean) : []
  }

  get redirectUrl() {
    return this._redirectUrl
  }

  get clientMetadata() {
    return {
      client_name: 'Snotra Desktop',
      redirect_uris: [String(this._redirectUrl)],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: this._clientSecret ? 'client_secret_post' : 'none',
      application_type: 'native',
      ...(this._scopes.length > 0 ? { scope: this._scopes.join(' ') } : {}),
    }
  }

  state() {
    return this._state
  }

  clientInformation() {
    if (this._clientInformation) return this._clientInformation
    if (!this._clientId) return undefined
    return {
      client_id: this._clientId,
      ...(this._clientSecret ? { client_secret: this._clientSecret } : {}),
      token_endpoint_auth_method: this._clientSecret ? 'client_secret_post' : 'none',
    }
  }

  saveClientInformation(value) {
    this._clientInformation = value
  }

  tokens() {
    return this._tokens
  }

  saveTokens(value) {
    this._tokens = value
  }

  redirectToAuthorization(url) {
    this._authorizationUrl = url.toString()
  }

  saveCodeVerifier(value) {
    this._codeVerifier = value
  }

  codeVerifier() {
    return this._codeVerifier
  }

  saveDiscoveryState(value) {
    this._discoveryState = value
  }

  discoveryState() {
    return this._discoveryState
  }

  invalidateCredentials(scope) {
    if (scope === 'all' || scope === 'tokens') this._tokens = undefined
    if (scope === 'all' || scope === 'client') this._clientInformation = undefined
    if (scope === 'all' || scope === 'verifier') this._codeVerifier = ''
    if (scope === 'all' || scope === 'discovery') this._discoveryState = undefined
  }

  get authorizationUrl() {
    return this._authorizationUrl
  }

  validateState(state) {
    return !!state && state === this._state
  }

  exportCredentials() {
    return {
      ...(this._clientSecret ? { clientSecret: this._clientSecret } : {}),
      ...(this._clientInformation ? { clientInformation: this._clientInformation } : {}),
      ...(this._tokens ? { tokens: this._tokens } : {}),
      ...(this._discoveryState ? { discoveryState: this._discoveryState } : {}),
    }
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

function makeStreamableTransport(url, headers, authProvider) {
  return new StreamableHTTPClientTransport(new URL(url), {
    fetch: fetchWithHeaders(headers),
    ...(authProvider ? { authProvider } : {}),
  })
}

function makeSseTransport(url, headers, authProvider) {
  const fetch = fetchWithHeaders(headers)
  return new SSEClientTransport(new URL(url), {
    eventSourceInit: { fetch },
    requestInit: {},
    fetch,
    ...(authProvider ? { authProvider } : {}),
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

async function connectWithTransport(name, transport, transportType, options = {}) {
  const client = makeClient()
  try {
    await client.connect(transport)
    const discovered = await discover(client)
    const tools = filterMcpTools(discovered.tools, options.toolFilter)
    const resources = discovered.resources
    const connection = {
      name,
      client,
      transport,
      transportType,
      tools,
      resources,
      serverInfo: client.getServerVersion?.() || null,
      authProvider: options.authProvider || null,
    }
    connections.set(name, connection)
    console.log(`[mcp] "${name}" connected via ${transportType}; ${tools.length} tool(s)`)
    return connection
  } catch (error) {
    if (
      error instanceof UnauthorizedError
      && options.authProvider?.authorizationUrl
    ) {
      pendingAuth.set(name, {
        name,
        url: options.url,
        headers: options.headers,
        transportType,
        toolFilter: options.toolFilter,
        client,
        transport,
        authProvider: options.authProvider,
        createdAt: Date.now(),
      })
      return {
        name,
        authRequired: true,
        authorizationUrl: options.authProvider.authorizationUrl,
        transportType,
      }
    }
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
export async function connectSseMcpServer(
  name,
  url,
  headers = {},
  preferredTransport = 'http',
  auth = {},
  toolFilter = {},
) {
  if (!name || !url) throw new Error('MCP server name and URL are required')
  let parsedUrl
  try {
    parsedUrl = new URL(url)
  } catch {
    throw new Error(`Unsupported MCP URL: ${url}`)
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error(`Unsupported MCP URL: ${url}`)
  }
  const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname)
  if (parsedUrl.protocol !== 'https:' && !isLoopback) {
    throw new Error('Remote MCP servers must use HTTPS; plain HTTP is allowed only on loopback')
  }

  await disconnectSseMcpServer(name)
  const safeHeaders = normalizeHeaders(headers)
  const authProvider = auth?.type === 'oauth'
    ? new SnotraOAuthProvider(auth)
    : null
  const options = {
    url,
    headers: safeHeaders,
    authProvider,
    toolFilter,
  }

  if (preferredTransport === 'sse') {
    try {
      const connection = await connectWithTransport(
        name,
        makeSseTransport(url, safeHeaders, authProvider),
        'sse',
        options,
      )
      if (connection.authRequired) return serializePendingAuth(connection)
      return serializeConnection(connection)
    } catch (error) {
      throw new Error(`Legacy SSE connection failed for "${name}": ${error?.message || error}`)
    }
  }

  let modernError
  try {
    const connection = await connectWithTransport(
      name,
      makeStreamableTransport(url, safeHeaders, authProvider),
      'streamable-http',
      options,
    )
    if (connection.authRequired) return serializePendingAuth(connection)
    return serializeConnection(connection)
  } catch (error) {
    modernError = error
    console.warn(`[mcp] Streamable HTTP failed for "${name}", trying legacy SSE: ${error?.message || error}`)
  }

  try {
    const fallbackProvider = auth?.type === 'oauth' ? new SnotraOAuthProvider(auth) : null
    const connection = await connectWithTransport(
      name,
      makeSseTransport(url, safeHeaders, fallbackProvider),
      'sse',
      { ...options, authProvider: fallbackProvider },
    )
    if (connection.authRequired) return serializePendingAuth(connection)
    return serializeConnection(connection)
  } catch (sseError) {
    throw new Error(
      `Remote MCP connection failed for "${name}". ` +
      `Streamable HTTP: ${modernError?.message || modernError}; ` +
      `legacy SSE: ${sseError?.message || sseError}`
    )
  }
}

function serializePendingAuth(pending) {
  return {
    authRequired: true,
    authorizationUrl: pending.authorizationUrl,
    transport: pending.transportType,
    tools: [],
    resources: [],
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

export async function completeSseMcpOAuth(name, code, state) {
  const pending = pendingAuth.get(name)
  if (!pending) throw new Error(`No pending OAuth flow for "${name}"`)
  if (Date.now() - pending.createdAt > OAUTH_FLOW_TTL_MS) {
    pendingAuth.delete(name)
    await closeTransport(pending.transport)
    throw new Error('OAuth flow expired; start the connection again')
  }
  if (!pending.authProvider.validateState(state)) {
    throw new Error('OAuth state validation failed')
  }

  await pending.transport.finishAuth(code)
  await closeTransport(pending.transport)
  pendingAuth.delete(name)

  const transport = pending.transportType === 'sse'
    ? makeSseTransport(pending.url, pending.headers, pending.authProvider)
    : makeStreamableTransport(pending.url, pending.headers, pending.authProvider)
  const connection = await connectWithTransport(name, transport, pending.transportType, {
    url: pending.url,
    headers: pending.headers,
    authProvider: pending.authProvider,
    toolFilter: pending.toolFilter,
  })
  if (connection.authRequired) {
    throw new Error('OAuth authorization completed but the MCP server still requires authorization')
  }
  oauthCredentialExports.set(name, pending.authProvider.exportCredentials())
  return serializeConnection(connection)
}

export function getSseMcpOAuthCredentials(name) {
  const connection = connections.get(name)
  if (connection?.authProvider) {
    return connection.authProvider.exportCredentials()
  }
  return oauthCredentialExports.get(name) || {}
}

export async function disconnectSseMcpServer(name) {
  const pending = pendingAuth.get(name)
  if (pending) {
    pendingAuth.delete(name)
    await closeTransport(pending.transport)
  }
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
        _sandboxCategory: 'mcp',
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
  const connected = [...connections.values()].map((connection) => ({
    name: connection.name,
    connected: true,
    status: 'connected',
    transport: connection.transportType,
    tools: connection.tools.map(serializeTool),
    resources: connection.resources.map(serializeResource),
    serverInfo: connection.serverInfo,
  }))
  const awaitingAuth = [...pendingAuth.values()].map((pending) => ({
    name: pending.name,
    connected: false,
    status: 'auth-required',
    transport: pending.transportType,
    authorizationUrl: pending.authProvider.authorizationUrl,
    tools: [],
    resources: [],
    serverInfo: null,
  }))
  return [...connected, ...awaitingAuth]
}

export function isSseMcpConnected(name) {
  return connections.has(name)
}

export function disconnectAllSseMcp() {
  for (const name of connections.keys()) disconnectSseMcpServer(name).catch(() => {})
  for (const name of pendingAuth.keys()) disconnectSseMcpServer(name).catch(() => {})
}
