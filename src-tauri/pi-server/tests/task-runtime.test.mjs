import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  buildTaskExecutionOptions,
  createTask,
  init,
} from '../task-scheduler.mjs'

test('task creation stores a secret-free immutable agent runtime snapshot', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 's-loop-task-runtime-'))
  try {
    init(root)
    const task = createTask({
      name: 'stable task',
      prompt: 'Review the project',
      schedule: { kind: 'interval', minutes: 30, display: 'every 30m' },
      agentRuntime: {
        agentId: 'reviewer',
        agentName: 'Reviewer',
        agentSystemPrompt: 'Be exact.',
        agentSkillsBlock: 'Use review skill.',
        permissionMode: 'ask',
        permissionRules: { read: 'allow', edit: 'deny', apiKey: 'nested-secret' },
        workspaceRoots: [],
        agentMcpServers: [],
        agentMcpTools: [],
        providerApiKeys: { openai: 'provider-secret' },
        apiKey: 'direct-secret',
        capturedAt: 123,
      },
    })

    assert.equal(task.agentRuntime.agentName, 'Reviewer')
    assert.deepEqual(task.agentRuntime.permissionRules, { read: 'allow', edit: 'deny' })
    assert.deepEqual(task.agentRuntime.agentMcpServers, [])
    const stored = fs.readFileSync(path.join(root, 'tasks', 'tasks.json'), 'utf8')
    assert.doesNotMatch(stored, /provider-secret|direct-secret|nested-secret/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('task execution prefers its captured agent runtime over the current global agent', () => {
  const options = buildTaskExecutionOptions({
    id: 'task-1',
    provider: 'deepseek',
    model: '',
    workspaceDir: 'C:\\task-workspace',
    agentRuntime: {
      agentName: 'Reviewer',
      agentSystemPrompt: 'Captured Soul',
      agentSkillsBlock: 'Captured skill',
      agentModel: 'deepseek-reasoner',
      permissionMode: 'deny',
      permissionRules: { read: 'allow' },
      workspaceRoots: [],
      agentMcpServers: [],
      agentMcpTools: [],
      capturedAt: 123,
    },
  }, {
    defaultProvider: 'openai',
    defaultModel: 'gpt-global',
    projectDir: 'C:\\global-workspace',
    apiKey: 'fallback-key',
    runtimeConfig: {
      agentSystemPrompt: 'Current global Soul',
      agentSkillsBlock: 'Current global skill',
      permissionMode: 'allow',
      agentMcpServers: ['global-server'],
      providerApiKeys: { deepseek: 'protected-deepseek-key' },
    },
  }, { runId: 'run-1', sessionId: 'session-1' })

  assert.equal(options.agentSystemPrompt, 'Captured Soul')
  assert.equal(options.agentSkillsBlock, 'Captured skill')
  assert.equal(options.permissionMode, 'deny')
  assert.deepEqual(options.agentMcpServers, [])
  assert.equal(options.providerID, 'deepseek')
  assert.equal(options.modelID, 'deepseek-reasoner')
  assert.equal(options.apiKey, 'protected-deepseek-key')
  assert.equal(options.workspaceDir, 'C:\\task-workspace')
})
