/**
 * Sub-agent Registry — Agent definition discovery and parsing
 *
 * Scans two directories for Markdown agent definitions:
 *   1. builtin-agents/  (shipped with pi-server)
 *   2. .s-loop/agents/  (user-created, project-level)
 *
 * Format: YAML frontmatter + Markdown body (compatible with pi's agent format)
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Minimal YAML frontmatter parser — handles the subset we need:
 * name, description, model, tools (list), thinkingLevel, maxTurns, permissionMode
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) return null

  const raw = match[1]
  const body = match[2].trim()

  // Parse simple YAML: key: value (no nested objects needed for agent defs)
  const frontmatter = {}
  let currentKey = null
  let currentList = null

  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // List item
    const listMatch = trimmed.match(/^\s*-\s+(.+)/)
    if (listMatch && currentKey !== null) {
      if (!Array.isArray(frontmatter[currentKey])) {
        frontmatter[currentKey] = []
      }
      frontmatter[currentKey].push(listMatch[1].trim())
      continue
    }

    // key: value
    const kvMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)/)
    if (kvMatch) {
      const key = kvMatch[1]
      const value = kvMatch[2].trim()
      // Remove surrounding quotes
      const cleanValue = value.replace(/^['"](.*)['"]$/, '$1')
      frontmatter[key] = cleanValue
      currentKey = key
      continue
    }

    // Continuation of a pipe/multiline (ignore - these shouldn't appear in our agent frontmatter)
    currentKey = null
  }

  return { frontmatter, body }
}

/**
 * Parse a single agent .md file.
 * Returns null if the file is invalid or missing required fields.
 */
function parseAgentMarkdown(filePath) {
  let content
  try {
    content = fs.readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }

  const parsed = parseFrontmatter(content)
  if (!parsed) return null

  const { frontmatter, body } = parsed
  if (!frontmatter.name || !frontmatter.description) return null

  return {
    name: frontmatter.name,
    description: frontmatter.description,
    model: frontmatter.model || null,
    tools: Array.isArray(frontmatter.tools) ? frontmatter.tools : [],
    thinkingLevel: frontmatter.thinkingLevel || 'off',
    maxTurns: parseInt(frontmatter.maxTurns, 10) || 10,
    permissionMode: frontmatter.permissionMode || 'allow',
    systemPrompt: body,
  }
}

/**
 * Load agents from a directory. Returns [] if dir doesn't exist.
 */
function loadAgentsFromDir(dir, source) {
  const agents = []
  if (!fs.existsSync(dir)) return agents

  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return agents
  }

  for (const entry of entries) {
    if (!entry.name.endsWith('.md')) continue
    if (!entry.isFile() && !entry.isSymbolicLink()) continue

    const filePath = path.join(dir, entry.name)
    const def = parseAgentMarkdown(filePath)
    if (def) {
      def.source = source
      def.filePath = filePath
      agents.push(def)
    }
  }

  return agents
}

/**
 * Discover all available sub-agents.
 * Built-in agents can be overridden by user agents with the same name.
 */
export function discoverAgents(projectDir) {
  const builtinDir = path.join(__dirname, '..', 'builtin-agents')
  const userDir = projectDir ? path.join(projectDir, '.s-loop', 'agents') : null

  const builtinAgents = loadAgentsFromDir(builtinDir, 'builtin')
  const userAgents = userDir ? loadAgentsFromDir(userDir, 'user') : []

  // Merge: user agents override built-in agents by name
  const agentMap = new Map()
  for (const agent of builtinAgents) agentMap.set(agent.name, agent)
  for (const agent of userAgents) agentMap.set(agent.name, agent)

  return {
    agents: Array.from(agentMap.values()),
    builtinDir,
    userDir,
  }
}

/**
 * Load a single agent definition by name.
 * Returns null if not found.
 */
export function loadAgentDefinition(agentName, projectDir) {
  const { agents } = discoverAgents(projectDir)
  return agents.find((a) => a.name === agentName) || null
}

/**
 * List agent names and descriptions (for error messages / display).
 */
export function formatAgentList(agents) {
  if (agents.length === 0) return 'none'
  return agents.map((a) => `"${a.name}" (${a.source}): ${a.description}`).join(', ')
}

export { parseAgentMarkdown, loadAgentsFromDir }
