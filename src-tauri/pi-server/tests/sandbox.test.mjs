import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { evaluateToolCall } from '../execution-policy.mjs'
import { checkWorkspacePath, sanitizeChildEnvironment } from '../sandbox.mjs'

test('workspace sandbox allows descendants and rejects traversal', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'snotra-sandbox-'))
  try {
    assert.equal(checkWorkspacePath('src/file.ts', root).allowed, true)
    assert.equal(checkWorkspacePath('../outside.txt', root).allowed, false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('explicit accessible paths extend the workspace sandbox', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'snotra-sandbox-'))
  const workspace = path.join(base, 'workspace')
  const shared = path.join(base, 'shared')
  fs.mkdirSync(workspace)
  fs.mkdirSync(shared)
  try {
    assert.equal(checkWorkspacePath(path.join(shared, 'data.json'), workspace, [shared]).allowed, true)
  } finally {
    fs.rmSync(base, { recursive: true, force: true })
  }
})

test('workspace roots enforce read-only and read-write grants', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'snotra-sandbox-'))
  const workspace = path.join(base, 'workspace')
  const readOnly = path.join(base, 'read-only')
  const writable = path.join(base, 'writable')
  fs.mkdirSync(workspace)
  fs.mkdirSync(readOnly)
  fs.mkdirSync(writable)
  try {
    const roots = [
      { path: readOnly, access: 'read', source: 'user-grant' },
      { path: writable, access: 'read-write', source: 'user-grant' },
    ]
    assert.equal(checkWorkspacePath(path.join(readOnly, 'data.json'), workspace, roots, 'read').allowed, true)
    assert.equal(checkWorkspacePath(path.join(readOnly, 'data.json'), workspace, roots, 'read-write').allowed, false)
    assert.equal(checkWorkspacePath(path.join(writable, 'data.json'), workspace, roots, 'read-write').allowed, true)
  } finally {
    fs.rmSync(base, { recursive: true, force: true })
  }
})

test('read-only roots block writes before agent permission mode is evaluated', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'snotra-sandbox-'))
  const workspace = path.join(base, 'workspace')
  const shared = path.join(base, 'shared')
  fs.mkdirSync(workspace)
  fs.mkdirSync(shared)
  try {
    const config = {
      workspaceDir: workspace,
      workspaceRoots: [{ path: shared, access: 'read' }],
      permissionMode: 'allow',
    }
    const read = evaluateToolCall(
      { name: 'read', arguments: { path: path.join(shared, 'data.json') } },
      config,
    )
    const write = evaluateToolCall(
      { name: 'write', arguments: { path: path.join(shared, 'data.json') } },
      config,
    )
    assert.equal(read.allowed, true)
    assert.equal(write.allowed, false)
    assert.match(write.reason, /read-only/)
  } finally {
    fs.rmSync(base, { recursive: true, force: true })
  }
})

test('legacy string roots retain read-write behavior', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'snotra-sandbox-'))
  const workspace = path.join(base, 'workspace')
  const shared = path.join(base, 'shared')
  fs.mkdirSync(workspace)
  fs.mkdirSync(shared)
  try {
    const result = evaluateToolCall(
      { name: 'write', arguments: { path: path.join(shared, 'data.json') } },
      {
        workspaceDir: workspace,
        accessiblePaths: [shared],
        permissionMode: 'allow',
      },
    )
    assert.equal(result.allowed, true)
  } finally {
    fs.rmSync(base, { recursive: true, force: true })
  }
})

test('workspace sandbox resolves symlinks before checking the boundary', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'snotra-sandbox-'))
  const workspace = path.join(base, 'workspace')
  const outside = path.join(base, 'outside')
  const link = path.join(workspace, 'linked')
  fs.mkdirSync(workspace)
  fs.mkdirSync(outside)
  try {
    try {
      fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir')
    } catch (error) {
      t.skip(`symlink creation unavailable: ${error.message}`)
      return
    }
    assert.equal(checkWorkspacePath(path.join(link, 'secret.txt'), workspace).allowed, false)
  } finally {
    fs.rmSync(base, { recursive: true, force: true })
  }
})

test('ask mode requires approval for writes, shell and MCP tools', () => {
  const workspaceDir = process.cwd()
  assert.equal(evaluateToolCall({ name: 'write', arguments: { path: 'x.txt' } }, { workspaceDir, permissionMode: 'ask' }).approvalRequired, true)
  assert.equal(evaluateToolCall({ name: 'bash', arguments: { command: 'git status' } }, { workspaceDir, permissionMode: 'ask' }).approvalRequired, true)
  assert.equal(evaluateToolCall({ name: 'company_search', arguments: {} }, { workspaceDir, permissionMode: 'ask', isMcp: true }).approvalRequired, true)
})

test('allow mode still blocks hardline commands and paths outside workspace', () => {
  const workspaceDir = process.cwd()
  assert.equal(evaluateToolCall({ name: 'bash', arguments: { command: 'shutdown -h now' } }, { workspaceDir, permissionMode: 'allow' }).allowed, false)
  assert.equal(evaluateToolCall({ name: 'write', arguments: { path: '../outside.txt' } }, { workspaceDir, permissionMode: 'allow' }).allowed, false)
})

test('deny mode blocks otherwise safe tools', () => {
  const result = evaluateToolCall(
    { name: 'read', arguments: { path: 'package.json' } },
    { workspaceDir: process.cwd(), permissionMode: 'deny' },
  )
  assert.equal(result.allowed, false)
  assert.match(result.reason, /deny-all/)
})

test('child environment removes inherited credentials and Node injection flags', () => {
  const env = sanitizeChildEnvironment({
    PATH: 'bin',
    HOME: '/home/test',
    OPENAI_API_KEY: 'secret',
    GH_TOKEN: 'secret',
    NODE_OPTIONS: '--require malicious.js',
  }, process.cwd())
  assert.equal(env.PATH, 'bin')
  assert.equal(env.HOME, '/home/test')
  assert.equal(env.OPENAI_API_KEY, undefined)
  assert.equal(env.GH_TOKEN, undefined)
  assert.equal(env.NODE_OPTIONS, undefined)
  assert.equal(env.S_LOOP_SANDBOX, 'workspace')
})
