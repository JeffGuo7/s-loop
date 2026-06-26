/**
 * Tests for agent-registry.mjs — Markdown parsing + agent discovery
 * Run: node --test subagent/agent-registry.test.mjs
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// We need to test the internal parseFrontmatter + parseAgentMarkdown logic
// Import the module for real testing
import { parseAgentMarkdown, discoverAgents, loadAgentDefinition, formatAgentList } from './agent-registry.mjs'

describe('parseAgentMarkdown', () => {
  it('parses a valid agent markdown file', () => {
    const md = `---
name: test-agent
description: A test agent for unit tests
model: claude-haiku-4-5
tools:
  - read
  - grep
  - find
thinkingLevel: off
maxTurns: 5
permissionMode: allow
---

# Test Agent

You are a test agent. Do test things.`

    const tmpDir = fs.mkdtempSync(path.join(__dirname, '..', 'test-agents-'))
    const tmpFile = path.join(tmpDir, 'test-agent.md')
    try {
      fs.writeFileSync(tmpFile, md, 'utf-8')
      const def = parseAgentMarkdown(tmpFile)
      assert.ok(def, 'should parse a valid agent')
      assert.equal(def.name, 'test-agent')
      assert.equal(def.description, 'A test agent for unit tests')
      assert.equal(def.model, 'claude-haiku-4-5')
      assert.deepEqual(def.tools, ['read', 'grep', 'find'])
      assert.equal(def.thinkingLevel, 'off')
      assert.equal(def.maxTurns, 5)
      assert.equal(def.permissionMode, 'allow')
      assert.ok(def.systemPrompt.includes('# Test Agent'), 'body should be in systemPrompt')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('returns null for file without frontmatter', () => {
    const md = '# Just a markdown file\n\nNo frontmatter here.'
    const tmpDir = fs.mkdtempSync(path.join(__dirname, '..', 'test-agents-'))
    const tmpFile = path.join(tmpDir, 'no-frontmatter.md')
    try {
      fs.writeFileSync(tmpFile, md, 'utf-8')
      const def = parseAgentMarkdown(tmpFile)
      assert.equal(def, null, 'should return null for invalid file')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('returns null for missing required fields', () => {
    const md = `---
tools:
  - read
---
Missing name and description.`

    const tmpDir = fs.mkdtempSync(path.join(__dirname, '..', 'test-agents-'))
    const tmpFile = path.join(tmpDir, 'missing-fields.md')
    try {
      fs.writeFileSync(tmpFile, md, 'utf-8')
      const def = parseAgentMarkdown(tmpFile)
      assert.equal(def, null, 'should return null when name/description missing')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('handles empty tools list', () => {
    const md = `---
name: no-tools
description: Agent with no explicit tools
---

No tools agent.`

    const tmpDir = fs.mkdtempSync(path.join(__dirname, '..', 'test-agents-'))
    const tmpFile = path.join(tmpDir, 'no-tools.md')
    try {
      fs.writeFileSync(tmpFile, md, 'utf-8')
      const def = parseAgentMarkdown(tmpFile)
      assert.ok(def)
      assert.deepEqual(def.tools, [])
      assert.equal(def.model, null, 'model should default to null')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})

describe('discoverAgents', () => {
  it('discovers builtin agents', () => {
    const { agents } = discoverAgents(null)
    const names = agents.map(a => a.name)
    assert.ok(names.includes('researcher'), 'should include researcher')
    assert.ok(names.includes('coder'), 'should include coder')
    assert.ok(names.includes('reviewer'), 'should include reviewer')
    agents.forEach(a => {
      assert.equal(a.source, 'builtin')
      assert.ok(a.name)
      assert.ok(a.description)
      assert.ok(a.systemPrompt)
    })
  })

  it('loads a specific agent by name', () => {
    const agent = loadAgentDefinition('researcher')
    assert.ok(agent)
    assert.equal(agent.name, 'researcher')
    assert.equal(agent.source, 'builtin')
    assert.ok(agent.tools.includes('read'))
    assert.ok(agent.tools.includes('grep'))
    assert.ok(!agent.tools.includes('write'), 'researcher should not have write tool')
  })

  it('returns null for unknown agent', () => {
    const agent = loadAgentDefinition('nonexistent-agent-xyz')
    assert.equal(agent, null)
  })

  it('formats agent list', () => {
    const { agents } = discoverAgents(null)
    const formatted = formatAgentList(agents)
    assert.ok(formatted.includes('researcher'))
    assert.ok(formatted.includes('coder'))
    assert.ok(formatted.includes('reviewer'))
  })

  it('overrides builtin with user agent of same name', () => {
    const tmpProjectDir = fs.mkdtempSync(path.join(__dirname, '..', 'test-project-'))
    const agentsDir = path.join(tmpProjectDir, '.s-loop', 'agents')
    fs.mkdirSync(agentsDir, { recursive: true })

    const userMd = `---
name: researcher
description: A custom researcher override
tools:
  - read
  - web_search
---

# Custom Researcher

I am a custom researcher agent.`

    try {
      fs.writeFileSync(path.join(agentsDir, 'researcher.md'), userMd, 'utf-8')
      const { agents } = discoverAgents(tmpProjectDir)
      const researcher = agents.find(a => a.name === 'researcher')
      assert.ok(researcher)
      assert.equal(researcher.source, 'user', 'user agent should override builtin')
      assert.equal(researcher.description, 'A custom researcher override')
    } finally {
      fs.rmSync(tmpProjectDir, { recursive: true, force: true })
    }
  })
})
