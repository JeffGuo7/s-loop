// Exec sandbox: argument construction plus a real run through the
// AppContainer helper when it is built (cargo build in runbox/). Skipped on
// non-Windows hosts and when the helper or Git Bash is unavailable.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { buildRunboxArgs, resolveRunboxPath, createSandboxedBashOperations } = await import('../exec-sandbox.mjs')

test('buildRunboxArgs places the cwd first as a writable root and dedupes', () => {
  const cwd = process.cwd()
  const args = buildRunboxArgs({
    writableRoots: [cwd, 'C:\\work\\other'],
    readonlyRoots: ['C:\\S-Loop\\bin'],
    shell: 'C:\\S-Loop\\bin\\busybox.exe',
    shellArgs: ['sh', '-c'],
    command: 'echo hi',
    cwd,
  })
  assert.deepEqual(args, [
    '--rw', cwd,
    '--rw', 'C:\\work\\other',
    '--rx', 'C:\\S-Loop\\bin',
    '--',
    'C:\\S-Loop\\bin\\busybox.exe', 'sh', '-c', 'echo hi',
  ])
})

const runbox = resolveRunboxPath()
const sandboxed = runbox
  ? createSandboxedBashOperations({ workspaceDir: fs.mkdtempSync(path.join(os.tmpdir(), 'sloop-exec-sandbox-')) })
  : null

test('runs bash inside the sandbox and allows workspace writes', { skip: !sandboxed && 'runbox helper or busybox runtime not available' }, async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'sloop-exec-ws-'))
  const ops = createSandboxedBashOperations({ workspaceDir: workspace })
  assert.ok(ops, 'sandbox operations should be available')

  let output = ''
  const result = await ops.exec('echo sandbox-run-ok && echo data > inside.txt && cat inside.txt', workspace, {
    onData: (chunk) => { output += chunk.toString('utf8') },
  })
  assert.equal(result.exitCode, 0, output)
  assert.match(output, /sandbox-run-ok/)
  assert.ok(fs.existsSync(path.join(workspace, 'inside.txt')))
  fs.rmSync(workspace, { recursive: true, force: true })
})

test('denies filesystem access outside the workspace', { skip: !sandboxed && 'runbox helper or Git Bash not available' }, async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'sloop-exec-ws-deny-'))
  const ops = createSandboxedBashOperations({ workspaceDir: workspace })
  const outside = path.join(os.homedir(), `sloop-sandbox-escape-${process.pid}.txt`)
  try { fs.rmSync(outside, { force: true }) } catch { /* absent */ }

  let output = ''
  const result = await ops.exec(`echo x > "${outside.replaceAll('\\', '/')}"`, workspace, {
    onData: (chunk) => { output += chunk.toString('utf8') },
  })
  assert.notEqual(result.exitCode, 0, 'write outside the workspace must fail')
  assert.equal(fs.existsSync(outside), false)
  fs.rmSync(workspace, { recursive: true, force: true })
})
