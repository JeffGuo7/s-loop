import test from 'node:test'
import assert from 'node:assert/strict'

import {
  deriveSubagentAuthority,
  intersectPermissionRules,
  MAX_DELEGATION_DEPTH,
} from './authority.mjs'

const tools = ['read', 'write', 'bash', 'web_search', 'delegate_task']
  .map((name) => ({ name }))

test('child mode and rules can only reduce parent authority', () => {
  const authority = deriveSubagentAuthority({
    name: 'worker',
    tools: ['read', 'write'],
    permissionMode: 'allow',
    maxTurns: 50,
  }, {
    permissionMode: 'ask',
    permissionRules: { write: 'ask', read: 'allow' },
    toolSecurity: new Map([
      ['read', {}],
      ['write', {}],
    ]),
    maxSubagentTurns: 8,
  }, tools)

  assert.equal(authority.config.permissionMode, 'ask')
  assert.equal(authority.config.permissionRules.write, 'ask')
  assert.deepEqual(authority.allowedTools.map((tool) => tool.name), ['read', 'write'])
  assert.equal(authority.maxTurns, 8)
})

test('empty tool requests grant no tools and parent tool set is an upper bound', () => {
  const empty = deriveSubagentAuthority({
    name: 'empty',
    tools: [],
    permissionMode: 'allow',
  }, {
    permissionMode: 'allow',
    toolSecurity: new Map([['read', {}]]),
  }, tools)
  assert.deepEqual(empty.allowedTools, [])

  const bounded = deriveSubagentAuthority({
    name: 'worker',
    tools: ['read', 'write', 'bash'],
    permissionMode: 'allow',
  }, {
    permissionMode: 'allow',
    toolSecurity: new Map([['read', {}]]),
  }, tools)
  assert.deepEqual(bounded.allowedTools.map((tool) => tool.name), ['read'])
})

test('delegation tools are never recursively inherited', () => {
  const authority = deriveSubagentAuthority({
    name: 'recursive',
    tools: ['read', 'delegate_task'],
    permissionMode: 'allow',
  }, {
    permissionMode: 'allow',
    toolSecurity: new Map([['read', {}], ['delegate_task', {}]]),
  }, tools)
  assert.deepEqual(authority.allowedTools.map((tool) => tool.name), ['read'])
})

test('Explorer is a fixed local read-only profile', () => {
  const authority = deriveSubagentAuthority({
    name: 'explorer',
    tools: ['write', 'bash', 'web_search'],
    permissionMode: 'allow',
  }, {
    permissionMode: 'allow',
    toolSecurity: new Map(tools.map((tool) => [tool.name, {}])),
    webSearchConfig: { apiKey: 'secret' },
  }, tools)
  assert.deepEqual(authority.allowedTools.map((tool) => tool.name), ['read'])
  assert.equal(authority.config.permissionMode, 'ask')
  assert.equal(authority.config.webSearchConfig, undefined)
})

test('permission rule intersection keeps the stricter action', () => {
  assert.deepEqual(
    intersectPermissionRules(
      { read: 'allow', write: 'deny' },
      { read: 'ask', write: 'allow', bash: 'allow' },
    ),
    { read: 'ask', write: 'deny', bash: 'allow' },
  )
})

test('delegation depth is bounded', () => {
  assert.throws(() => deriveSubagentAuthority({
    name: 'worker',
    tools: ['read'],
  }, {
    delegationDepth: MAX_DELEGATION_DEPTH,
  }, tools), /depth limit/)
})
