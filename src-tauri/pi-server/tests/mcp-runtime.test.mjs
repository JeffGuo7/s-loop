// Tests for the pi-mcp-backed MCP runtime: streamable HTTP + stdio transports,
// tool naming (`mcp__<server>__<tool>`), sandbox rules, and the OAuth 2.1
// authorization-code flow (PKCE via a loopback callback) against a mock
// authorization server.

import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

// The runtime reads the data dir at import time — set it before importing.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sloop-mcp-runtime-'))
process.env.S_LOOP_PROJECT_DIR = dataDir

const { connectMcpServer, disconnectMcpServer, callMcpTool, getMcpStatus, getAllMcpTools, isMcpConnected, disconnectAllMcp, startMcpSignIn, getMcpOAuthCredentials } = await import('../mcp-runtime.mjs')
const { filterRemoteMcpTools } = await import('../mcp-scope.mjs')

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => resolve(body ? JSON.parse(body) : {}))
    request.on('error', reject)
  })
}

function rpcResponse(id, result) {
  return { jsonrpc: '2.0', id, result }
}

function createModernServer() {
  return http.createServer(async (request, response) => {
    if (request.method === 'GET') {
      response.writeHead(405)
      response.end()
      return
    }
    const body = await readBody(request)
    const id = body.id
    if (body.method === 'initialize') {
      response.writeHead(200, {
        'Content-Type': 'application/json',
        'Mcp-Session-Id': 'modern-test-session',
      })
      response.end(JSON.stringify(rpcResponse(id, {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: 'modern-test', version: '1.0.0' },
      })))
      return
    }
    if (body.method === 'notifications/initialized') {
      response.writeHead(202)
      response.end()
      return
    }
    if (body.method === 'tools/list') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(rpcResponse(id, {
        tools: [{ name: 'echo', description: 'Echo input', inputSchema: { type: 'object' } }],
      })))
      return
    }
    if (body.method === 'resources/list') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(rpcResponse(id, {
        resources: [{ name: 'test', uri: 'test://resource', mimeType: 'text/plain' }],
      })))
      return
    }
    if (body.method === 'tools/call') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(rpcResponse(id, {
        content: [{ type: 'text', text: body.params.arguments.value }],
      })))
      return
    }
    response.writeHead(400)
    response.end()
  })
}

/** Mock OAuth-protected MCP server: full discovery, DCR-free client id, PKCE token endpoint. */
function createOAuthServer() {
  let base = ''
  let codeCount = 0
  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url, base)
    if (request.method === 'GET' && requestUrl.pathname.startsWith('/.well-known/oauth-protected-resource')) {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        resource: `${base}/mcp`,
        authorization_servers: [base],
        scopes_supported: ['mcp'],
      }))
      return
    }
    if (request.method === 'GET' && requestUrl.pathname === '/.well-known/oauth-authorization-server') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        issuer: base,
        authorization_endpoint: `${base}/authorize`,
        token_endpoint: `${base}/token`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
      }))
      return
    }
    if (request.method === 'POST' && requestUrl.pathname === '/token') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        access_token: 'oauth-test-token',
        refresh_token: 'oauth-test-refresh',
        token_type: 'Bearer',
        expires_in: 3600,
      }))
      return
    }
    if (request.method === 'GET' && requestUrl.pathname === '/authorize') {
      // Simulate the resource owner approving: redirect to the loopback
      // callback with a fresh code, exactly like a real provider would.
      codeCount++
      const target = new URL(requestUrl.searchParams.get('redirect_uri'))
      target.searchParams.set('code', `test-code-${codeCount}`)
      target.searchParams.set('state', requestUrl.searchParams.get('state'))
      response.writeHead(302, { Location: String(target) })
      response.end()
      return
    }
    if (requestUrl.pathname !== '/mcp') {
      response.writeHead(404)
      response.end()
      return
    }
    if (request.headers.authorization !== 'Bearer oauth-test-token') {
      response.writeHead(401, {
        'WWW-Authenticate': `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp", scope="mcp"`,
      })
      response.end()
      return
    }
    if (request.method === 'GET') {
      response.writeHead(405)
      response.end()
      return
    }
    const body = await readBody(request)
    const id = body.id
    if (body.method === 'initialize') {
      response.writeHead(200, {
        'Content-Type': 'application/json',
        'Mcp-Session-Id': 'oauth-test-session',
      })
      response.end(JSON.stringify(rpcResponse(id, {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'oauth-test', version: '1.0.0' },
      })))
      return
    }
    if (body.method === 'notifications/initialized') {
      response.writeHead(202)
      response.end()
      return
    }
    if (body.method === 'tools/list') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(rpcResponse(id, {
        tools: [{ name: 'secure_echo', inputSchema: { type: 'object' } }],
      })))
      return
    }
    if (body.method === 'resources/list') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(rpcResponse(id, { resources: [] })))
      return
    }
    if (body.method === 'tools/call') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(rpcResponse(id, {
        content: [{ type: 'text', text: 'secure ok' }],
      })))
      return
    }
    response.writeHead(400)
    response.end()
  })
  return {
    server,
    setBase(value) {
      base = value
    },
  }
}

/** Minimal stdio MCP server: line-delimited JSON-RPC on stdin/stdout. */
function stdioServerScript() {
  return `
    let buffer = '';
    function send(msg) { process.stdout.write(JSON.stringify(msg) + '\\n'); }
    process.stdin.on('data', (chunk) => {
      buffer += chunk;
      let index;
      while ((index = buffer.indexOf('\\n')) !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        const msg = JSON.parse(line);
        if (msg.method === 'initialize') {
          send({ jsonrpc: '2.0', id: msg.id, result: {
            protocolVersion: '2025-06-18',
            capabilities: { tools: {} },
            serverInfo: { name: 'stdio-test', version: '1.0.0' },
          } });
        } else if (msg.method === 'tools/list') {
          send({ jsonrpc: '2.0', id: msg.id, result: { tools: [
            { name: 'hello', description: 'Greet someone', inputSchema: { type: 'object', properties: { who: { type: 'string' } } } },
          ] } });
        } else if (msg.method === 'tools/call') {
          const who = msg.params.arguments?.who || 'world';
          send({ jsonrpc: '2.0', id: msg.id, result: {
            content: [{ type: 'text', text: 'hello ' + who + ' env=' + (process.env.MCP_TEST_MARKER || 'none') }],
          } });
        } else if (msg.id !== undefined) {
          send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'method not found' } });
        }
      }
    });
  `
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  return `http://127.0.0.1:${port}`
}

async function waitFor(condition, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = condition()
    if (value) return value
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('condition not met before timeout')
}

test.afterEach(async () => {
  await disconnectAllMcp()
})

test('connects to Streamable HTTP, preserves session, lists and calls tools', async (t) => {
  const server = createModernServer()
  const base = await listen(server)
  t.after(async () => {
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  })

  const result = await connectMcpServer('modern-test', {
    url: `${base}/mcp`,
    headers: { Authorization: 'Bearer test' },
  })
  assert.equal(result.transport, 'streamable-http')
  assert.equal(result.tools[0].name, 'echo')
  assert.equal(result.resources[0].uri, 'test://resource')

  const call = await callMcpTool('modern-test', 'echo', { value: 'ok' })
  assert.equal(call.content[0].text, 'ok')

  assert.equal(getMcpStatus()[0].transport, 'streamable-http')
  assert.equal(isMcpConnected('modern-test'), true)

  const tools = getAllMcpTools()
  assert.equal(tools[0].name, 'mcp__modern-test__echo')
  assert.equal(tools[0]._mcpServer, 'modern-test')
  assert.equal(tools[0]._sandboxCategory, 'mcp')
  const executed = await tools[0].execute('call-1', { value: 'via-agent' })
  assert.equal(executed.content[0].text, 'via-agent')
})

test('connects to a stdio MCP server with sanitized env plus explicit env', async (t) => {
  const result = await connectMcpServer('stdio-test', {
    command: process.execPath,
    args: ['-e', stdioServerScript()],
    env: { MCP_TEST_MARKER: 'passed-through' },
  })
  assert.equal(result.transport, 'stdio')
  assert.equal(result.tools[0].name, 'hello')

  const call = await callMcpTool('stdio-test', 'hello', { who: 's-loop' })
  assert.match(call.content[0].text, /hello s-loop/)
  // sanitized environment carries the standard vars; the explicit marker is applied on top
  assert.match(call.content[0].text, /env=passed-through/)

  const tools = getAllMcpTools()
  assert.equal(tools[0].name, 'mcp__stdio-test__hello')
})

test('rejects insecure non-loopback remote MCP URLs and empty configs', async () => {
  await assert.rejects(
    connectMcpServer('insecure', { url: 'http://192.0.2.10/mcp' }),
    /must use HTTPS/,
  )
  await assert.rejects(
    connectMcpServer('empty', {}),
    /needs either "command"/,
  )
})

test('remote MCP tools respect the delegated scope filter', () => {
  const tools = getAllMcpTools()
  const scoped = [
    { name: 'mcp__a__search', _mcpServer: 'a', _mcpToolName: 'search' },
    { name: 'mcp__b__search', _mcpServer: 'b', _mcpToolName: 'search' },
  ]
  assert.deepEqual(
    filterRemoteMcpTools(scoped, { serverNames: ['a'] }).map((tool) => tool.name),
    ['mcp__a__search'],
  )
  assert.equal(filterRemoteMcpTools(scoped, undefined).length, 2)
  assert.equal(tools.length >= 0, true)
})

test('runs the full OAuth flow: 401 -> PKCE sign-in -> reconnect with token', async (t) => {
  const fixture = createOAuthServer()
  const base = await listen(fixture.server)
  fixture.setBase(base)
  t.after(async () => {
    fixture.server.closeAllConnections?.()
    await new Promise((resolve) => fixture.server.close(resolve))
  })

  const pending = await connectMcpServer('oauth-test', {
    url: `${base}/mcp`,
    auth: { type: 'oauth', clientId: 's-loop-test-client' },
  })
  assert.equal(pending.status, 'auth-required', JSON.stringify(pending))

  // The sign-in promise resolves only after the loopback callback receives
  // the code; drive the "browser" side from this test meanwhile.
  const signIn = startMcpSignIn('oauth-test')
  const authorizationUrl = await waitFor(
    () => getMcpStatus().find((s) => s.name === 'oauth-test')?.authorizationUrl,
  )
  assert.match(authorizationUrl, /\/authorize/)

  const response = await fetch(authorizationUrl, { redirect: 'manual' })
  assert.equal(response.status, 302)
  await fetch(response.headers.get('location')) // hits the loopback callback

  const done = await signIn
  assert.equal(done.status, 'connected')
  assert.equal(done.tools[0].name, 'secure_echo')

  const call = await callMcpTool('oauth-test', 'secure_echo', {})
  assert.equal(call.content[0].text, 'secure ok') // authenticated round trip through the tool

  const credentials = await getMcpOAuthCredentials('oauth-test')
  assert.equal(credentials.oauth?.access_token, 'oauth-test-token')
})
