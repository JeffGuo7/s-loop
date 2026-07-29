import test from 'node:test'
import assert from 'node:assert/strict'

import {
  evaluateSidecarRequest,
  isAllowedOrigin,
  tokenMatches,
} from '../http-security.mjs'

const TOKEN = 'a'.repeat(64)

test('allows only trusted browser origins while permitting non-browser clients', () => {
  assert.equal(isAllowedOrigin(undefined), true)
  assert.equal(isAllowedOrigin('tauri://localhost'), true)
  assert.equal(isAllowedOrigin('http://tauri.localhost'), true)
  assert.equal(isAllowedOrigin('http://localhost:1420'), true)
  assert.equal(isAllowedOrigin('http://127.0.0.1:1420'), true)
  assert.equal(isAllowedOrigin('https://evil.example'), false)
  assert.equal(isAllowedOrigin('http://localhost.evil.example'), false)
})

test('compares sidecar tokens without accepting missing or different values', () => {
  assert.equal(tokenMatches(TOKEN, TOKEN), true)
  assert.equal(tokenMatches('b'.repeat(64), TOKEN), false)
  assert.equal(tokenMatches('', TOKEN), false)
  assert.equal(tokenMatches(TOKEN, ''), false)
})

test('protects normal API requests and rejects an untrusted origin before token checks', () => {
  assert.deepEqual(
    evaluateSidecarRequest({
      method: 'POST',
      pathname: '/session',
      origin: 'tauri://localhost',
      providedToken: TOKEN,
      expectedToken: TOKEN,
    }),
    { allowed: true },
  )

  const missing = evaluateSidecarRequest({
    method: 'POST',
    pathname: '/session',
    origin: 'tauri://localhost',
    expectedToken: TOKEN,
  })
  assert.equal(missing.allowed, false)
  assert.equal(missing.status, 401)

  const crossSite = evaluateSidecarRequest({
    method: 'POST',
    pathname: '/session',
    origin: 'https://evil.example',
    providedToken: TOKEN,
    expectedToken: TOKEN,
  })
  assert.equal(crossSite.allowed, false)
  assert.equal(crossSite.status, 403)
})

test('keeps health, signed platform ingress, and trusted preflight tokenless', () => {
  assert.equal(evaluateSidecarRequest({
    method: 'GET',
    pathname: '/health',
    origin: 'http://localhost:1420',
    expectedToken: TOKEN,
  }).allowed, true)

  assert.equal(evaluateSidecarRequest({
    method: 'POST',
    pathname: '/platforms/inbound/slack',
    expectedToken: TOKEN,
  }).allowed, true)

  const preflight = evaluateSidecarRequest({
    method: 'OPTIONS',
    pathname: '/session',
    origin: 'http://localhost:1420',
    expectedToken: TOKEN,
  })
  assert.equal(preflight.allowed, true)
  assert.equal(preflight.preflight, true)
})
