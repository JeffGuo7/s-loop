import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SERVER_DIR = dirname(fileURLToPath(new URL('../index.mjs', import.meta.url)))
const TOKEN = 'c'.repeat(64)

let child
let dataDir
let baseUrl

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close((error) => {
        if (error) reject(error)
        else resolve(address.port)
      })
    })
  })
}

async function waitUntilReady(process, timeoutMs = 15_000) {
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('pi-server did not announce readiness'))
    }, timeoutMs)
    let stderr = ''

    const cleanup = () => {
      clearTimeout(timer)
      process.stdout?.off('data', onStdout)
      process.stderr?.off('data', onStderr)
      process.off('exit', onExit)
    }
    const onStdout = (chunk) => {
      if (String(chunk).includes('listening on')) {
        cleanup()
        resolve()
      }
    }
    const onStderr = (chunk) => {
      stderr = (stderr + String(chunk)).slice(-4_000)
    }
    const onExit = (code) => {
      cleanup()
      reject(new Error(`pi-server exited before readiness (${code}): ${stderr}`))
    }

    process.stdout?.on('data', onStdout)
    process.stderr?.on('data', onStderr)
    process.once('exit', onExit)
  })
}

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'snotra-auth-'))
  const port = await freePort()
  baseUrl = `http://127.0.0.1:${port}`
  child = spawn(process.execPath, ['index.mjs'], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      PI_SERVER_PORT: String(port),
      SNOTRA_API_TOKEN: TOKEN,
      S_LOOP_PROJECT_DIR: dataDir,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
  await waitUntilReady(child)
})

after(async () => {
  if (child && child.exitCode === null) {
    child.kill()
    await new Promise((resolve) => child.once('exit', resolve))
  }
  if (dataDir) await rm(dataDir, { recursive: true, force: true })
})

test('full sidecar enforces token and browser origin while keeping health public', async () => {
  const health = await fetch(`${baseUrl}/health`)
  assert.equal(health.status, 200)

  const missingToken = await fetch(`${baseUrl}/tasks`)
  assert.equal(missingToken.status, 401)

  const badOrigin = await fetch(`${baseUrl}/tasks`, {
    headers: {
      'X-Snotra-Token': TOKEN,
      Origin: 'https://evil.example',
    },
  })
  assert.equal(badOrigin.status, 403)

  const authorized = await fetch(`${baseUrl}/tasks`, {
    headers: {
      'X-Snotra-Token': TOKEN,
      Origin: 'tauri://localhost',
    },
  })
  assert.equal(authorized.status, 200)
  assert.equal(authorized.headers.get('access-control-allow-origin'), 'tauri://localhost')

  const approvals = await fetch(`${baseUrl}/approvals?status=pending`, {
    headers: {
      'X-Snotra-Token': TOKEN,
      Origin: 'tauri://localhost',
    },
  })
  assert.equal(approvals.status, 200)
  assert.deepEqual(await approvals.json(), [])
})
