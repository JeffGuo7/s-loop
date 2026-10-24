// HTTP route smoke tests: boot the real pi-server sidecar and verify the
// route modules still serve every surface after the index.mjs split.
// These exercise auth, origin checks, and one representative route per
// extracted module end to end.

import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(SERVER_DIR, '..')
const TOKEN = 'http-routes-test-token'
const PORT = 4591
const BASE = `http://127.0.0.1:${PORT}`

function startServer(t) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sloop-http-routes-'))
  const child = spawn(process.execPath, [path.join(ROOT, 'index.mjs')], {
    env: {
      ...process.env,
      PI_SERVER_PORT: String(PORT),
      S_LOOP_API_TOKEN: TOKEN,
      S_LOOP_PROJECT_DIR: dataDir,
      S_LOOP_PROJECT_DIR: dataDir,
    },
    // Keep stdin open: index.mjs treats stdin EOF as "parent process exited"
    // and shuts itself down.
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  t.after(() => {
    child.kill()
    fs.rmSync(dataDir, { recursive: true, force: true })
  })

  const diagnostics = []
  child.stdout.on('data', (c) => diagnostics.push(`stdout: ${c}`))
  child.stderr.on('data', (c) => diagnostics.push(`stderr: ${c}`))
  return { child, diagnostics, dataDir }
}

async function waitForListening(child, diagnostics) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early (${child.exitCode}):\n${diagnostics.join('')}`)
    }
    if (diagnostics.join('').includes('listening on')) return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`server never became ready:\n${diagnostics.join('')}`)
}

function request(method, pathname, { body, origin = 'http://localhost:1420' } = {}) {
  return fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      'x-s-loop-token': TOKEN,
      origin,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

test('sidecar serves every extracted route group', async (t) => {
  const { child, diagnostics, dataDir } = startServer(t)
  await waitForListening(child, diagnostics)

  await t.test('health is public and carries the service marker', async () => {
    const res = await fetch(`${BASE}/health`)
    assert.equal(res.status, 200)
    const json = await res.json()
    assert.equal(json.healthy, true)
    assert.equal(json.service, 's-loop-pi-server')
  })

  await t.test('auth is enforced on extracted routes', async () => {
    const noToken = await fetch(`${BASE}/models`)
    assert.equal(noToken.status, 401)
    const badOrigin = await fetch(`${BASE}/models`, {
      headers: { 'x-s-loop-token': TOKEN, origin: 'https://evil.example' },
    })
    assert.equal(badOrigin.status, 403)
  })

  await t.test('model catalog routes', async () => {
    const models = await request('GET', '/models?provider=anthropic')
    assert.equal(models.status, 200)
    assert.ok(Array.isArray(await models.json()))

    const providers = await request('GET', '/providers')
    assert.equal(providers.status, 200)
    assert.ok(Array.isArray(await providers.json()))

    const capabilities = await request('GET', '/model-capabilities?provider=anthropic&model=claude-sonnet-4-20250514')
    assert.equal(capabilities.status, 200)
    const caps = await capabilities.json()
    assert.equal(typeof caps.reasoning, 'boolean')
  })

  await t.test('extension routes', async () => {
    const res = await request('GET', '/extensions')
    assert.equal(res.status, 200)
    assert.ok(Array.isArray(await res.json()))
  })

  await t.test('governance routes (approvals, audit, runtime config)', async () => {
    const approvals = await request('GET', '/approvals')
    assert.equal(approvals.status, 200)
    assert.ok(Array.isArray(await approvals.json()))

    const events = await request('GET', '/audit/events')
    assert.equal(events.status, 200)

    const verify = await request('GET', '/audit/verify')
    assert.equal(verify.status, 200)
    assert.equal((await verify.json()).valid, true)

    const config = await request('POST', '/runtime/config', { body: { workspaceDir: process.cwd() } })
    assert.equal(config.status, 200)
    assert.deepEqual(await config.json(), { ok: true })
  })

  await t.test('subagent routes: list, save, delete', async (t2) => {
    const list = await request('GET', '/subagents')
    assert.equal(list.status, 200)
    assert.ok(Array.isArray(await list.json()))

    const runs = await request('GET', '/subagents/runs')
    assert.equal(runs.status, 200)

    const save = await request('POST', '/subagents/tester', {
      body: {
        name: 'tester',
        description: 'created by http-routes.test.mjs',
        systemPrompt: 'You are a test agent.',
        projectDir: dataDir,
      },
    })
    assert.equal(save.status, 200)
    const saved = await save.json()
    assert.equal(saved.ok, true)
    t2.after(async () => {
      const del = await request('DELETE', `/subagents/tester?projectDir=${encodeURIComponent(dataDir)}`)
      assert.equal(del.status, 200)
    })
  })

  await t.test('pptx preview enforces the workspace sandbox through route ctx', async () => {
    // A `..` escape lands outside the workspace on every platform, unlike a
    // Windows absolute path which Linux would resolve inside the workspace.
    const res = await request('GET', `/preview/pptx?path=${encodeURIComponent('../escaped-secret.txt')}`)
    assert.equal(res.status, 403)
  })

  await t.test('unknown routes still 404', async () => {
    const res = await request('GET', '/definitely-not-a-route')
    assert.equal(res.status, 404)
  })
})
