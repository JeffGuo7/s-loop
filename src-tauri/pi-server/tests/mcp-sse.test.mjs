import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import {
  connectSseMcpServer,
  completeSseMcpOAuth,
  disconnectSseMcpServer,
  callSseMcpTool,
  getSseMcpStatus,
  getAllSseMcpTools,
  filterMcpTools,
} from '../mcp-sse.mjs'

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

function createOAuthServer() {
  let base = ''
  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url, base)
    if (request.method === 'GET' && requestUrl.pathname === '/.well-known/oauth-protected-resource/mcp') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        resource: `${base}/mcp`,
        authorization_servers: [base],
        scopes_supported: ['mcp'],
      }))
      return
    }
    if (request.method === 'GET' && requestUrl.pathname === '/.well-known/oauth-protected-resource') {
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

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  return `http://127.0.0.1:${port}`
}

test('connects to Streamable HTTP, preserves session, lists and calls tools', async (t) => {
  const server = createModernServer()
  const base = await listen(server)
  t.after(async () => {
    await disconnectSseMcpServer('modern-test')
    server.closeAllConnections?.()
    await new Promise((resolve) => server.close(resolve))
  })

  const result = await connectSseMcpServer('modern-test', `${base}/mcp`, { Authorization: 'Bearer test' })
  assert.equal(result.transport, 'streamable-http')
  assert.equal(result.tools[0].name, 'echo')
  assert.equal(result.resources[0].uri, 'test://resource')
  const call = await callSseMcpTool('modern-test', 'echo', { value: 'ok' })
  assert.equal(call.content[0].text, 'ok')
  assert.equal(getSseMcpStatus()[0].transport, 'streamable-http')
  assert.equal(getAllSseMcpTools()[0].name, 'mcp_sse_modern_test_echo')
})

test('applies allow and deny filters with deny taking precedence', () => {
  const tools = [
    { name: 'company_search' },
    { name: 'company_delete' },
    { name: 'risk_search' },
  ]
  assert.deepEqual(
    filterMcpTools(tools, {
      allow: ['company_*'],
      deny: ['*_delete'],
    }).map((tool) => tool.name),
    ['company_search'],
  )
})

test('rejects insecure non-loopback remote MCP URLs', async () => {
  await assert.rejects(
    connectSseMcpServer('insecure', 'http://192.0.2.10/mcp'),
    /must use HTTPS/,
  )
})

test('completes MCP OAuth discovery, PKCE redirect and code exchange', async (t) => {
  const fixture = createOAuthServer()
  const base = await listen(fixture.server)
  fixture.setBase(base)
  t.after(async () => {
    await disconnectSseMcpServer('oauth-test')
    fixture.server.closeAllConnections?.()
    await new Promise((resolve) => fixture.server.close(resolve))
  })

  const pending = await connectSseMcpServer(
    'oauth-test',
    `${base}/mcp`,
    {},
    'http',
    {
      type: 'oauth',
      clientId: 'snotra-test-client',
      redirectUrl: 'http://127.0.0.1:4096/mcp-oauth/callback/oauth-test',
    },
  )
  assert.equal(pending.authRequired, true)
  const authorizationUrl = new URL(pending.authorizationUrl)
  assert.equal(authorizationUrl.pathname, '/authorize')
  assert.equal(authorizationUrl.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(authorizationUrl.searchParams.get('resource'), `${base}/mcp`)

  const connected = await completeSseMcpOAuth(
    'oauth-test',
    'authorization-code',
    authorizationUrl.searchParams.get('state'),
  )
  assert.equal(connected.transport, 'streamable-http')
  assert.equal(connected.tools[0].name, 'secure_echo')
})
