import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import {
  connectSseMcpServer,
  disconnectSseMcpServer,
  callSseMcpTool,
  getSseMcpStatus,
  getAllSseMcpTools,
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
