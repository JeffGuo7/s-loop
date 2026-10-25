/**
 * MCP runtime backed by @earendil-works/pi-mcp — pi 1.4's own MCP client.
 *
 * Replaces the hand-rolled SSE/HTTP client (mcp-sse.mjs) and matches the MCP
 * design that ships inside pi: streamable HTTP and stdio transports, OAuth 2.1
 * with PKCE against a loopback callback, durable token storage, and the
 * `mcp__<server>__<tool>` tool naming convention.
 *
 * HTTP surface consumed by routes/mcp-routes.mjs:
 *   connectMcpServer(name, config)  config: {url, headers} | {command, args, env, cwd}
 *                                   plus optional {auth, toolFilter}
 *   disconnectMcpServer(name) / callMcpTool(server, tool, args) / getMcpStatus()
 *   startMcpSignIn(name)            runs the OAuth code flow (PKCE, loopback)
 *   getMcpOAuthCredentials(name) / isMcpConnected(name) / disconnectAllMcp()
 *
 * Security notes:
 *  - Remote servers must use HTTPS unless they are on loopback.
 *  - stdio children run with the sanitized child environment; only the env the
 *    user explicitly configured for the server is added on top.
 *  - Every tool still flows through the shared policy engine: tools carry
 *    `_sandboxCategory: 'mcp'` and default to risk `external` / approval `ask`.
 *  - OAuth tokens live in `<dataDir>/.s-loop/mcp-auth.json` (pi's token shape).
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  McpAuthRequiredError,
  McpClient,
  StdioTransport,
  StreamableHttpTransport,
} from '@earendil-works/pi-mcp'
import { authorizeMcp, McpOAuthProvider, OAuthCallbackServer } from '@earendil-works/pi-mcp/oauth'
import { sanitizeChildEnvironment } from './sandbox.mjs'

const DATA_DIR = process.env.S_LOOP_PROJECT_DIR || process.env.SNOTRA_PROJECT_DIR || process.cwd()
const AUTH_STORE_PATH = join(DATA_DIR, '.s-loop', 'mcp-auth.json')
const CLIENT_INFO = { name: 'S-Loop', title: 'S-Loop Desktop', version: '0.2.0' }

/** Durable per-server OAuth state (client registration, tokens, PKCE), JSON on disk. */
class FileOAuthStateStore {
  constructor(key) {
    this.key = key
  }

  async load() {
    try {
      const all = JSON.parse(await readFile(AUTH_STORE_PATH, 'utf8'))
      const state = all?.servers?.[this.key]
      return state && typeof state === 'object' ? state : undefined
    } catch {
      return undefined
    }
  }

  async save(state) {
    await mkdir(join(DATA_DIR, '.s-loop'), { recursive: true })
    let all = {}
    try {
      all = JSON.parse(await readFile(AUTH_STORE_PATH, 'utf8'))
    } catch {
      // first write
    }
    all.servers = all.servers || {}
    if (state === undefined || state === null) delete all.servers[this.key]
    else all.servers[this.key] = state
    const tmp = `${AUTH_STORE_PATH}.${randomUUID()}.tmp`
    await writeFile(tmp, JSON.stringify(all, null, 2))
    await rename(tmp, AUTH_STORE_PATH)
  }
}

// name → server state
const servers = new Map()

function serverUrlOf(entry) {
  return entry.kind === 'remote' ? entry.url : ''
}

function stateKey(name, url) {
  return url ? `${name}|${url}` : name
}

function buildAuthProvider(name, entry) {
  if (entry.kind !== 'remote' || entry.auth?.type !== 'oauth') return undefined
  const store = new FileOAuthStateStore(stateKey(name, entry.url))
  // Read-only token supplier for the transport. 401s surface as
  // McpAuthRequiredError (never an automatic browser flow); sign-in runs
  // explicitly through startMcpSignIn.
  return {
    authProvider: {
      token: async () => (await store.load())?.tokens?.access_token,
    },
  }
}

function buildTransport(name, entry, authProvider) {
  if (entry.kind === 'stdio') {
    return new StdioTransport({
      command: entry.command,
      args: entry.args || [],
      cwd: entry.cwd || DATA_DIR,
      env: sanitizeChildEnvironment(undefined, entry.cwd || DATA_DIR),
      // Explicit server env is user configuration and is applied on top of the
      // sanitized base (mirrors what the Rust layer used to do for MCP).
      ...(entry.env && Object.keys(entry.env).length > 0
        ? { env: { ...sanitizeChildEnvironment(undefined, entry.cwd || DATA_DIR), ...entry.env } }
        : {}),
      stderr: 'pipe',
      onStderr: (chunk) => {
        const text = String(chunk).trim()
        if (text) console.log(`[mcp] ${name} stderr: ${text.slice(0, 300)}`)
      },
    })
  }
  return new StreamableHttpTransport({
    url: entry.url,
    headers: entry.headers || {},
    ...(authProvider ? { authProvider: authProvider.authProvider } : {}),
  })
}

async function refreshConnectionTools(state) {
  state.tools = await state.client.listTools()
  state.resources = []
  try {
    state.resources = await state.client.listResources()
  } catch {
    // Servers without resource support reject the listing; that is fine.
  }
}

async function openConnection(name, entry, authProvider) {
  const transport = buildTransport(name, entry, authProvider)
  const client = new McpClient(CLIENT_INFO)
  const serverInfo = await client.connect(transport)
  return { transport, client, serverInfo }
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

function serializeStatus(state) {
  return {
    name: state.name,
    connected: state.status === 'connected',
    status: state.status,
    transport: state.transportType,
    error: state.error,
    tools: state.tools.map(serializeTool),
    resources: state.resources.map(serializeResource),
    serverInfo: state.serverInfo,
    ...(state.status === 'auth-required'
      ? { authorizationUrl: state.authorizationUrl || null }
      : {}),
  }
}

async function closeServerState(state) {
  try { await state.client?.close() } catch { /* already gone */ }
  try { await state.transport?.close() } catch { /* already gone */ }
  if (state.callbackServer) {
    await state.callbackServer.close().catch(() => {})
    state.callbackServer = undefined
  }
}

async function dropServer(name) {
  const existing = servers.get(name)
  if (!existing) return
  servers.delete(name)
  await closeServerState(existing)
}

/**
 * Connect an MCP server.
 *
 * `config` is pi's mcpServers shape plus S-Loop's extras:
 *   { command, args, env, cwd }            → stdio server
 *   { url, headers? }                      → streamable HTTP server
 *   auth: { type: 'oauth', clientId?, clientSecret?, scope? }
 *   toolFilter: { serverNames?, toolNames?, tools? }
 */
export async function connectMcpServer(name, config = {}) {
  if (!name || typeof name !== 'string') throw new Error('MCP server name is required')
  const isStdio = typeof config.command === 'string' && config.command.trim() !== ''
  const isRemote = typeof config.url === 'string' && config.url.trim() !== ''
  if (!isStdio && !isRemote) {
    throw new Error('MCP server config needs either "command" (stdio) or "url" (streamable HTTP)')
  }

  let entry
  if (isStdio) {
    entry = {
      kind: 'stdio',
      command: config.command,
      args: Array.isArray(config.args) ? config.args : [],
      env: config.env && typeof config.env === 'object' ? { ...config.env } : {},
      cwd: typeof config.cwd === 'string' && config.cwd.trim() ? config.cwd : undefined,
      auth: config.auth,
      toolFilter: config.toolFilter,
    }
  } else {
    let parsedUrl
    try {
      parsedUrl = new URL(config.url)
    } catch {
      throw new Error(`Unsupported MCP URL: ${config.url}`)
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error(`Unsupported MCP URL: ${config.url}`)
    }
    const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(parsedUrl.hostname)
    if (parsedUrl.protocol !== 'https:' && !isLoopback) {
      throw new Error('Remote MCP servers must use HTTPS; plain HTTP is allowed only on loopback')
    }
    entry = {
      kind: 'remote',
      url: config.url,
      headers: normalizeHeaders(config.headers),
      auth: config.auth,
      toolFilter: config.toolFilter,
    }
  }

  await dropServer(name)
  const state = {
    name,
    entry,
    transportType: isStdio ? 'stdio' : 'streamable-http',
    tools: [],
    resources: [],
    serverInfo: null,
    status: 'connecting',
    error: undefined,
    challenge: undefined,
    authorizationUrl: undefined,
    callbackServer: undefined,
  }
  servers.set(name, state)

  const authProvider = buildAuthProvider(name, entry)
  try {
    const { transport, client, serverInfo } = await openConnection(name, entry, authProvider)
    state.transport = transport
    state.client = client
    state.serverInfo = serverInfo
    state.status = 'connected'
    await refreshConnectionTools(state)
    console.log(`[mcp] "${name}" connected via ${state.transportType}: ${state.tools.length} tool(s)`)
    return serializeStatus(state)
  } catch (error) {
    if (error instanceof McpAuthRequiredError) {
      state.status = 'auth-required'
      state.challenge = {
        ...(error.wwwAuthenticate ? { wwwAuthenticate: error.wwwAuthenticate } : {}),
      }
      state.error = 'Authorization required: sign in to continue'
      console.log(`[mcp] "${name}" requires OAuth sign-in`)
      return serializeStatus(state)
    }
    servers.delete(name)
    await closeServerState(state).catch(() => {})
    throw new Error(`MCP connection failed for "${name}": ${error?.message || error}`)
  }
}

/**
 * Run pi's OAuth 2.1 authorization-code flow (PKCE, DCR or CIMD) for a remote
 * server and reconnect with the stored tokens. The authorization URL is
 * returned for the desktop app to open; the provider redirects to a loopback
 * callback server that this flow starts and stops.
 */
export async function startMcpSignIn(name) {
  const state = servers.get(name)
  if (!state) throw new Error(`MCP server "${name}" is not configured`)
  if (state.entry.kind !== 'remote') throw new Error(`OAuth sign-in only applies to remote servers`)
  if (state.entry.auth?.type !== 'oauth') throw new Error(`MCP server "${name}" is not configured for OAuth`)

  if (state.callbackServer) await state.callbackServer.close().catch(() => {})
  const callbackServer = await OAuthCallbackServer.listen()
  state.callbackServer = callbackServer

  const provider = new McpOAuthProvider({
    serverUrl: state.entry.url,
    redirectUrl: callbackServer.redirectUrl,
    clientMetadata: {
      client_name: 'S-Loop Desktop',
      client_uri: 'https://github.com/JeffGuo7/s-loop',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    },
    ...(state.entry.auth?.clientId ? { clientId: state.entry.auth.clientId } : {}),
    ...(state.entry.auth?.clientSecret ? { clientSecret: state.entry.auth.clientSecret } : {}),
    store: new FileOAuthStateStore(stateKey(name, state.entry.url)),
    onRedirect: (url) => {
      state.authorizationUrl = String(url)
      console.log(`[mcp] "${name}" OAuth: open ${state.authorizationUrl}`)
    },
  })

  try {
    // Phase 1: discovery + client registration + authorization URL. Resolves
    // with "REDIRECT" — the caller (desktop app) opens the URL and the
    // provider redirects the browser to our loopback callback.
    const result = await authorizeMcp(provider, {
      serverUrl: state.entry.url,
      signal: undefined,
    })
    if (result !== 'REDIRECT') {
      // Tokens were already valid (refresh grant) — nothing to wait for.
      return
    }
    // Phase 2: wait for the browser redirect, then exchange the code.
    const stateParam = await provider.state()
    const callback = await callbackServer.waitForCallback(stateParam)
    await authorizeMcp(provider, {
      serverUrl: state.entry.url,
      authorizationCode: callback.code,
      iss: callback.iss,
      signal: undefined,
    })
  } finally {
    await callbackServer.close().catch(() => {})
    if (state.callbackServer === callbackServer) state.callbackServer = undefined
  }

  // The provider chains token writes on an internal queue that may still be
  // flushing when authorizeMcp resolves; wait until the tokens actually reach
  // the store before reconnecting.
  const store = new FileOAuthStateStore(stateKey(name, state.entry.url))
  let stored
  for (let i = 0; i < 30; i++) {
    stored = await store.load()
    if (stored?.tokens?.access_token) break
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  if (!stored?.tokens?.access_token) {
    throw new Error(`MCP sign-in for "${name}" completed but no tokens were stored`)
  }

  // Tokens are in the store now; reconnect with a token-reading auth provider.
  await dropServer(name)
  const reconnectState = {
    name,
    entry: state.entry,
    transportType: state.transportType,
    tools: [],
    resources: [],
    serverInfo: null,
    status: 'connecting',
  }
  servers.set(name, reconnectState)
  try {
    const authProvider = buildAuthProvider(name, reconnectState.entry)
    const { transport, client, serverInfo } = await openConnection(name, reconnectState.entry, authProvider)
    reconnectState.transport = transport
    reconnectState.client = client
    reconnectState.serverInfo = serverInfo
    reconnectState.status = 'connected'
    await refreshConnectionTools(reconnectState)
    console.log(`[mcp] "${name}" OAuth sign-in complete: ${reconnectState.tools.length} tool(s)`)
    return serializeStatus(reconnectState)
  } catch (error) {
    reconnectState.status = 'failed'
    reconnectState.error = error?.message || String(error)
    throw error
  }
}

/** pi-mcp OAuth tokens of a server (empty object when none). */
export async function getMcpOAuthCredentials(name) {
  const state = servers.get(name)
  const url = state ? serverUrlOf(state.entry) : ''
  try {
    const all = JSON.parse(await readFile(AUTH_STORE_PATH, 'utf8'))
    const stored = all?.servers?.[stateKey(name, url)]
    return stored?.tokens ? { oauth: stored.tokens } : {}
  } catch {
    return {}
  }
}

export async function disconnectMcpServer(name) {
  await dropServer(name)
  console.log(`[mcp] "${name}" disconnected`)
}

export async function callMcpTool(serverName, toolName, args) {
  const state = servers.get(serverName)
  if (!state || state.status !== 'connected') {
    throw new Error(`Remote MCP server "${serverName}" is not connected`)
  }
  try {
    return await state.client.callTool(toolName, args || {})
  } catch (error) {
    throw new Error(`MCP tool call "${serverName}/${toolName}" failed: ${error?.message || error}`)
  }
}

/** Tools of every connected server, in pi's `mcp__<server>__<tool>` naming. */
export function getAllMcpTools() {
  const all = []
  for (const state of servers.values()) {
    if (state.status !== 'connected') continue
    for (const tool of state.tools) {
      all.push({
        name: `mcp__${state.name}__${tool.name}`,
        label: `${state.name}/${tool.name}`,
        description: tool.description || `${state.name} MCP tool: ${tool.name}`,
        parameters: tool.inputSchema || { type: 'object', properties: {} },
        _mcpServer: state.name,
        _mcpToolName: tool.name,
        _sandboxCategory: 'mcp',
        executionMode: 'parallel',
        execute: async (_toolCallId, params) => {
          try {
            const result = await callMcpTool(state.name, tool.name, params)
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

export function getMcpStatus() {
  return [...servers.values()].map(serializeStatus)
}

export function isMcpConnected(name) {
  return servers.get(name)?.status === 'connected'
}

export function disconnectAllMcp() {
  for (const name of [...servers.keys()]) disconnectMcpServer(name).catch(() => {})
}

function normalizeHeaders(headers) {
  const safe = {}
  for (const [key, value] of Object.entries(headers || {})) {
    if (typeof key === 'string' && key.trim() && typeof value === 'string' && value.trim()) {
      safe[key.trim()] = value
    }
  }
  return safe
}
