import { timingSafeEqual } from 'node:crypto'

export const API_TOKEN_HEADER = 'x-snotra-token'

const ALLOWED_ORIGIN = /^(?:tauri:\/\/localhost|https?:\/\/tauri\.localhost|https?:\/\/localhost(?::\d+)?|https?:\/\/127\.0\.0\.1(?::\d+)?)$/
const PLATFORM_INBOUND = /^\/platforms\/inbound\/[a-z0-9_-]+$/
const MCP_OAUTH_CALLBACK = /^\/mcp-oauth\/callback\/[^/]+$/

export function isAllowedOrigin(origin) {
  return !origin || ALLOWED_ORIGIN.test(origin)
}

function isPublicRequest(method, pathname) {
  return (method === 'GET' && pathname === '/health')
    || (method === 'GET' && MCP_OAUTH_CALLBACK.test(pathname))
    || (method === 'POST' && PLATFORM_INBOUND.test(pathname))
}

export function tokenMatches(provided, expected) {
  if (!provided || !expected) return false
  const left = Buffer.from(String(provided))
  const right = Buffer.from(String(expected))
  return left.length === right.length && timingSafeEqual(left, right)
}

export function evaluateSidecarRequest({
  method,
  pathname,
  origin,
  providedToken,
  expectedToken,
}) {
  if (!isAllowedOrigin(origin)) {
    return { allowed: false, status: 403, error: 'origin is not allowed' }
  }
  if (method === 'OPTIONS') {
    return { allowed: true, preflight: true }
  }
  if (isPublicRequest(method, pathname)) {
    return { allowed: true, public: true }
  }
  if (!tokenMatches(providedToken, expectedToken)) {
    return { allowed: false, status: 401, error: 'missing or invalid sidecar token' }
  }
  return { allowed: true }
}

export function guardSidecarRequest(req, res, url, expectedToken) {
  const origin = req.headers.origin
  const decision = evaluateSidecarRequest({
    method: req.method || 'GET',
    pathname: url.pathname,
    origin,
    providedToken: req.headers[API_TOKEN_HEADER],
    expectedToken,
  })

  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Snotra-Token')

  if (decision.preflight) {
    res.writeHead(204)
    res.end()
    return false
  }
  if (!decision.allowed) {
    res.writeHead(decision.status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: decision.error }))
    return false
  }
  return true
}
