import assert from 'node:assert/strict'
import test from 'node:test'

import { evaluateToolCall } from '../execution-policy.mjs'
import {
  buildToolSecurityIndex,
  validateToolSecurityMetadata,
} from '../tool-security.mjs'

test('built-in tools resolve to structured policy decisions', () => {
  const decision = evaluateToolCall(
    { name: 'read', arguments: { path: 'package.json' } },
    { workspaceDir: process.cwd(), permissionMode: 'ask' },
  )

  assert.equal(decision.outcome, 'allow')
  assert.equal(decision.allowed, true)
  assert.equal(decision.approvalRequired, false)
  assert.equal(decision.risk, 'read')
  assert.equal(decision.source, 'builtin')
  assert.equal(decision.matchedRule, 'mode:ask')
  assert.equal(decision.resolvedTargets.length, 1)
})

test('subagent delegation is safe orchestration while delegated tools remain policy-checked', () => {
  const decision = evaluateToolCall(
    {
      name: 'run_subagent',
      arguments: { agent: 'coder', task: 'Inspect the project' },
    },
    { workspaceDir: process.cwd(), permissionMode: 'ask' },
  )

  assert.equal(decision.outcome, 'allow')
  assert.equal(decision.risk, 'read')
  assert.equal(decision.source, 'builtin')
})

test('unknown tools require approval even in allow mode', () => {
  const decision = evaluateToolCall(
    { name: 'third_party_magic', arguments: {} },
    { workspaceDir: process.cwd(), permissionMode: 'allow' },
  )

  assert.equal(decision.outcome, 'approval-required')
  assert.equal(decision.approvalRequired, true)
  assert.equal(decision.matchedRule, 'missing-security-metadata')
  assert.equal(decision.risk, 'external')
})

test('deny mode remains stronger than the unknown-tool fallback', () => {
  const decision = evaluateToolCall(
    { name: 'third_party_magic', arguments: {} },
    { workspaceDir: process.cwd(), permissionMode: 'deny' },
  )

  assert.equal(decision.outcome, 'deny')
  assert.equal(decision.approvalRequired, false)
  assert.equal(decision.matchedRule, 'mode:deny')
})

test('MCP and unannotated extension tools default to approval', () => {
  const tools = [
    { name: 'remote_lookup', _sandboxCategory: 'mcp' },
    { name: 'extension_action', _extension: 'example-extension' },
  ]
  const toolSecurity = buildToolSecurityIndex(tools)

  const mcp = evaluateToolCall(
    { name: 'remote_lookup', arguments: {} },
    { permissionMode: 'allow', toolSecurity },
  )
  const extension = evaluateToolCall(
    { name: 'extension_action', arguments: {} },
    { permissionMode: 'allow', toolSecurity },
  )

  assert.equal(mcp.outcome, 'approval-required')
  assert.equal(mcp.source, 'mcp')
  assert.equal(extension.outcome, 'approval-required')
  assert.equal(extension.source, 'extension')
})

test('valid extension metadata can describe a read-only tool', () => {
  const toolSecurity = buildToolSecurityIndex([{
    name: 'inspect_manifest',
    _extension: 'example-extension',
    security: {
      risk: 'read',
      pathArguments: ['manifestPath'],
      approvalDefault: 'allow',
      source: 'builtin',
      parallelSafe: true,
    },
  }])
  const decision = evaluateToolCall(
    { name: 'inspect_manifest', arguments: { manifestPath: 'package.json' } },
    { workspaceDir: process.cwd(), permissionMode: 'ask', toolSecurity },
  )

  assert.equal(decision.outcome, 'allow')
  assert.equal(decision.source, 'extension')
  assert.equal(decision.risk, 'read')
  assert.equal(decision.resolvedTargets.length, 1)
})

test('invalid metadata is rejected instead of silently trusted', () => {
  assert.equal(validateToolSecurityMetadata({
    risk: 'harmless',
    approvalDefault: 'allow',
    source: 'extension',
  }), null)
})

test('allow rules cannot elevate ask-mode write authority', () => {
  const decision = evaluateToolCall(
    { name: 'write', arguments: { path: 'output.txt' } },
    {
      workspaceDir: process.cwd(),
      permissionMode: 'ask',
      permissionRules: { write: 'allow' },
    },
  )

  assert.equal(decision.outcome, 'approval-required')
  assert.equal(decision.risk, 'write-local')
})
