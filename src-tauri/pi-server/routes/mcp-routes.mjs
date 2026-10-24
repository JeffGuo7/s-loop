// SSE/HTTP MCP server management routes and the workspace PPTX preview.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  callSseMcpTool,
  completeSseMcpOAuth,
  connectSseMcpServer,
  disconnectSseMcpServer,
  getSseMcpOAuthCredentials,
  getSseMcpStatus,
} from '../mcp-sse.mjs'
import { checkWorkspacePath } from '../sandbox.mjs'
import { renderPptxHtml } from '../pptx-tools.mjs'
import { readJsonBody } from '../http-body.mjs'

export function handleMcpRoutes(req, res, url, ctx) {
  const { runtimeConfig, DATA_DIR } = ctx

  // GET /mcp-oauth/callback/:name — browser redirect target for SSE MCP OAuth
  const oauthCallbackMatch = url.pathname.match(/^\/mcp-oauth\/callback\/([^/]+)$/)
  if (req.method === 'GET' && oauthCallbackMatch) {
    const name = decodeURIComponent(oauthCallbackMatch[1])
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    if (!code || !state) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<h1>S-Loop OAuth failed</h1><p>The authorization response is missing code or state.</p>')
      return true
    }
    completeSseMcpOAuth(name, code, state).then(() => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<h1>Authorization complete</h1><p>You can close this window and return to S-Loop.</p>')
    }).catch((error) => {
      const message = String(error?.message || error).replace(/[<>&"']/g, '')
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<h1>S-Loop OAuth failed</h1><p>${message}</p>`)
    })
    return true
  }

  if (req.method === 'GET' && url.pathname === '/mcp-oauth/credentials') {
    const name = url.searchParams.get('name')
    if (!name) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Missing "name"' }))
      return true
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(getSseMcpOAuthCredentials(name)))
    return true
  }

  if (req.method === 'GET' && url.pathname === '/mcp-sse/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(getSseMcpStatus()))
    return true
  }

  // GET /preview/pptx?path=... — render a workspace .pptx to high-fidelity
  // HTML via officecli for the frontend preview panel. Falls back to the
  // frontend's text extraction when this errors.
  if (req.method === 'GET' && url.pathname === '/preview/pptx') {
    const rawPath = url.searchParams.get('path') || ''
    void handlePptxPreview(req, res, rawPath, runtimeConfig, DATA_DIR)
    return true
  }

  // POST /mcp-sse/connect — connect to an SSE MCP server
  if (req.method === 'POST' && url.pathname === '/mcp-sse/connect') {
    readJsonBody(req).then(async (data) => {
      try {
        const { name, url: serverUrl, headers, transport, auth, toolFilter } = data
        if (!name || !serverUrl) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing "name" or "url"' })); return }
        const result = await connectSseMcpServer(
          name,
          serverUrl,
          headers || {},
          transport || 'http',
          auth || {},
          toolFilter || {},
        )
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, ...result }))
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
    }).catch((e) => {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    })
    return true
  }

  // POST /mcp-sse/disconnect — disconnect from an SSE MCP server
  if (req.method === 'POST' && url.pathname === '/mcp-sse/disconnect') {
    readJsonBody(req).then(async (data) => {
      try {
        const { name } = data
        if (!name) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing "name"' })); return }
        await disconnectSseMcpServer(name)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
    }).catch((e) => {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    })
    return true
  }

  // POST /mcp-sse/call — call a tool on an SSE MCP server
  if (req.method === 'POST' && url.pathname === '/mcp-sse/call') {
    readJsonBody(req).then(async (data) => {
      try {
        const { serverName, toolName, arguments: args } = data
        if (!serverName || !toolName) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing "serverName" or "toolName"' })); return }
        const result = await callSseMcpTool(serverName, toolName, args || {})
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
    }).catch((e) => {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    })
    return true
  }

  return false
}

async function handlePptxPreview(req, res, rawPath, runtimeConfig, DATA_DIR) {
  if (!rawPath.trim()) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Missing "path"' }))
    return
  }
  let absPath
  try {
    const check = checkWorkspacePath(
      rawPath,
      runtimeConfig.workspaceDir || DATA_DIR,
      Array.isArray(runtimeConfig.workspaceRoots) ? runtimeConfig.workspaceRoots : [],
      'read',
    )
    if (!check.allowed) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: check.reason || 'Path is outside the workspace sandbox' }))
      return
    }
    absPath = check.resolvedPath
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: err?.message || String(err) }))
    return
  }
  if (!fs.existsSync(absPath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: `File not found: ${absPath}` }))
    return
  }

  // Render into the OS temp dir: SERVER_DIR can be read-only (Program Files
  // installs), and the preview output has no module-resolution constraint.
  const tmpOut = path.join(os.tmpdir(), `sloop-pptx-preview-${randomUUID()}.html`)
  const controller = new AbortController()
  req.on('close', () => controller.abort())
  try {
    await renderPptxHtml(absPath, tmpOut, {}, controller.signal)
    if (controller.signal.aborted) return
    const html = await fs.promises.readFile(tmpOut, 'utf8')
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  } catch (err) {
    if (controller.signal.aborted) {
      try { res.destroy() } catch { /* socket already gone */ }
      return
    }
    const status = err?.unavailable ? 503 : 500
    try {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err?.message || String(err) }))
    } catch { /* headers already sent */ }
  } finally {
    fs.rm(tmpOut, { force: true }, () => {})
  }
}
