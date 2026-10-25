// SSE/HTTP MCP server management routes and the workspace PPTX preview.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  callMcpTool,
  connectMcpServer,
  disconnectMcpServer,
  getMcpOAuthCredentials,
  getMcpStatus,
  startMcpSignIn,
} from '../mcp-runtime.mjs'
import { checkWorkspacePath } from '../sandbox.mjs'
import { renderPptxHtml } from '../pptx-tools.mjs'
import { readJsonBody } from '../http-body.mjs'

export function handleMcpRoutes(req, res, url, ctx) {
  const { runtimeConfig, DATA_DIR } = ctx

  // GET /mcp-oauth/callback/:name — legacy redirect target. OAuth now runs
  // through pi's loopback callback (POST /mcp-sse/oauth-start); kept as a
  // public route only to tell stale bookmarks what changed.
  const oauthCallbackMatch = url.pathname.match(/^\/mcp-oauth\/callback\/([^/]+)$/)
  if (req.method === 'GET' && oauthCallbackMatch) {
    res.writeHead(410, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end('<h1>S-Loop OAuth</h1><p>This callback is no longer used. Start the sign-in again from Settings.</p>')
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
    res.end(JSON.stringify(getMcpOAuthCredentials(name)))
    return true
  }

  if (req.method === 'GET' && url.pathname === '/mcp-sse/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(getMcpStatus()))
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

  // POST /mcp-sse/connect — connect an MCP server (streamable HTTP or stdio).
  // Body: pi's mcpServers shape {url, headers} | {command, args, env, cwd}
  // plus optional {auth, toolFilter}.
  if (req.method === 'POST' && url.pathname === '/mcp-sse/connect') {
    readJsonBody(req).then(async (data) => {
      try {
        const { name, url: serverUrl, headers, transport, auth, toolFilter, command, args, env, cwd } = data
        if (!name || (!serverUrl && !command)) {
          res.writeHead(400); res.end(JSON.stringify({ error: 'Missing "name" and one of "url"/"command"' })); return
        }
        void transport
        const result = await connectMcpServer(name, {
          ...(serverUrl ? { url: serverUrl } : {}),
          ...(headers ? { headers } : {}),
          ...(command ? { command, args, env, cwd } : {}),
          ...(auth ? { auth } : {}),
          ...(toolFilter ? { toolFilter } : {}),
        })
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

  // POST /mcp-sse/oauth-start — run pi's OAuth 2.1 flow (PKCE, loopback
  // callback) for a server configured with auth.type === 'oauth'. Resolves
  // once the sign-in completed and the server reconnected; the authorization
  // URL is reported through /mcp-sse/status while the flow waits.
  if (req.method === 'POST' && url.pathname === '/mcp-sse/oauth-start') {
    readJsonBody(req).then(async (data) => {
      try {
        const { name } = data
        if (!name) { res.writeHead(400); res.end(JSON.stringify({ error: 'Missing "name"' })); return }
        const result = await startMcpSignIn(name)
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
        await disconnectMcpServer(name)
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
        const result = await callMcpTool(serverName, toolName, args || {})
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
