#!/usr/bin/env node
/**
 * End-to-end provider wiring check.
 *
 * Boots the real pi-server sidecar, configures a provider/model, sends one
 * chat message and reports exactly how far the request travels:
 *   - model resolution failure  -> catalog/config problem
 *   - connection error          -> network/proxy problem
 *   - 401/403 from the provider -> wiring is correct, key is not
 *   - streamed reply            -> fully working
 *
 * Usage:
 *   node scripts/verify-provider.mjs deepseek deepseek-v4-flash [apiKey]
 *
 * The API key is read from argv[3] or the DEEPSEEK_API_KEY-style env var
 * ("<PROVIDER>_API_KEY" uppercased with dashes -> underscores). Without a
 * key the run stops at the provider's auth check, which still proves the
 * model resolution and endpoint wiring.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SERVER_DIR = join(ROOT, 'src-tauri', 'pi-server')

const [provider = 'deepseek', modelId = '', keyArg] = process.argv.slice(2)
const envKey = provider.toUpperCase().replace(/-/g, '_') + '_API_KEY'
const apiKey = keyArg || process.env[envKey] || 'sk-wiring-test-no-real-key'
const PORT = 4593
const BASE = `http://127.0.0.1:${PORT}`
const TOKEN = 'verify-provider-token'

const model = modelId || 'deepseek-v4-flash'
const dataDir = mkdtempSync(join(tmpdir(), 'sloop-verify-'))
const child = spawn(process.execPath, [join(SERVER_DIR, 'index.mjs')], {
  cwd: SERVER_DIR,
  env: {
    ...process.env,
    PI_SERVER_PORT: String(PORT),
    S_LOOP_API_TOKEN: TOKEN,
    S_LOOP_PROJECT_DIR: dataDir,
  },
  stdio: ['pipe', 'pipe', 'pipe'],
})

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const headers = { 'x-s-loop-token': TOKEN, origin: 'http://localhost:1420' }

async function waitForListening() {
  let log = ''
  child.stdout.on('data', (c) => (log += c))
  child.stderr.on('data', (c) => (log += c))
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early:\n${log}`)
    if (log.includes('listening on')) return
    await wait(100)
  }
  throw new Error(`server never became ready:\n${log}`)
}

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...headers, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res
}

try {
  await waitForListening()
  console.log(`[verify] provider=${provider} model=${model} key=${apiKey.startsWith('sk-') && apiKey.length < 20 ? '(placeholder)' : '(provided)'}`)

  const catalog = await api('GET', `/models?provider=${provider}`)
  const catalogList = await catalog.json()
  console.log(`[verify] catalog: ${catalog.status}, ${catalogList.length} model(s) for ${provider}`)
  if (catalogList.length > 0) console.log(`[verify]   - ${catalogList.slice(0, 5).map((m) => m.id).join(', ')}`)

  const session = await api('POST', '/session')
  const { id: sessionId } = await session.json()
  console.log(`[verify] session: ${sessionId}`)

  const res = await api('POST', `/session/${sessionId}/message`, {
    content: 'Reply with exactly: OK',
    providerID: provider,
    modelID: model,
    apiKey,
  })
  console.log(`[verify] message: HTTP ${res.status} ${res.headers.get('content-type')}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let stream = ''
  let sawText = ''
  let sawDone = false
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    stream += decoder.decode(value, { stream: true })
    for (const m of stream.matchAll(/event: (\w+)\ndata: (.+)\n\n/g)) {
      const [, event, raw] = m
      if (event === 'result') sawText = JSON.parse(raw).text || ''
      else if (event === 'error') sawText = 'Error: ' + (JSON.parse(raw).message || raw)
      else if (event === 'done') sawDone = true
    }
  }
  void sawDone

  if (sawText.trim() && !/^Error:/i.test(sawText.trim())) {
    console.log(`[verify] RESULT: FULL ROUND TRIP OK — model replied: ${sawText.trim().slice(0, 120)}`)
  } else if (/401|403|authentication|invalid[_ ]api[_ ]key|api key/i.test(sawText)) {
    console.log(`[verify] RESULT: WIRING OK, key rejected by the provider API:`)
    console.log(`[verify]   ${sawText.slice(0, 200)}`)
    console.log(`[verify]   (model resolved, provider endpoint reached — supply a real key for a full round trip)`)
  } else if (sawText) {
    console.log(`[verify] RESULT: pipeline error:`)
    console.log(`[verify]   ${sawText.slice(0, 300)}`)
    process.exitCode = 1
  } else {
    console.log(`[verify] RESULT: no text and no error event (unexpected stream)`)
    process.exitCode = 1
  }

  await api('DELETE', `/session/${sessionId}`)
} finally {
  child.kill()
  await wait(300)
  rmSync(dataDir, { recursive: true, force: true })
}
