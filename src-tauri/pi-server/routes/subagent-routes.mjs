// Sub-agent discovery, run inspection and user sub-agent .md CRUD routes.

import fs from 'node:fs'
import path from 'node:path'
import { discoverAgents, loadAgentDefinition } from '../subagent/agent-registry.mjs'
import { cancelSubagentRun, listSubagentRuns } from '../subagent/run-store.mjs'
import { readJsonBody } from '../http-body.mjs'

function getSubagentList(projectDir) {
  const { agents } = discoverAgents(projectDir)
  return agents.map((a) => ({
    name: a.name,
    description: a.description,
    model: a.model,
    tools: a.tools,
    source: a.source,
    maxTurns: a.maxTurns,
    maxTokens: a.maxTokens,
    thinkingLevel: a.thinkingLevel,
    permissionMode: a.permissionMode,
    systemPromptPreview: a.systemPrompt.slice(0, 200),
  }))
}

export function handleSubagentRoutes(req, res, url, ctx) {
  const { runtimeConfig, DATA_DIR } = ctx

  if (req.method === 'GET' && url.pathname === '/subagents') {
    const projectDir = url.searchParams.get('projectDir') || runtimeConfig.workspaceDir || DATA_DIR
    const list = getSubagentList(projectDir)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(list))
    return true
  }

  if (req.method === 'GET' && url.pathname === '/subagents/runs') {
    const limit = Number(url.searchParams.get('limit')) || 50
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(listSubagentRuns(limit)))
    return true
  }

  const subagentCancelMatch = url.pathname.match(/^\/subagents\/runs\/([^/]+)\/cancel$/)
  if (req.method === 'POST' && subagentCancelMatch) {
    const cancelled = cancelSubagentRun(decodeURIComponent(subagentCancelMatch[1]))
    res.writeHead(cancelled ? 200 : 409, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: cancelled }))
    return true
  }

  // POST /subagents/:name — create or update a user sub-agent .md file
  const subagentSaveMatch = url.pathname.match(/^\/subagents\/([^/]+)$/)
  if (req.method === 'POST' && subagentSaveMatch) {
    const agentName = decodeURIComponent(subagentSaveMatch[1])
    readJsonBody(req).then((data) => {
      try {
        const projectDir = data.projectDir || runtimeConfig.workspaceDir || DATA_DIR
        const agentsDir = path.join(projectDir, '.s-loop', 'agents')
        if (!fs.existsSync(agentsDir)) {
          fs.mkdirSync(agentsDir, { recursive: true })
        }

        // Build .md content from frontmatter + body
        const frontmatter = [
          '---',
          `name: ${data.name || agentName}`,
          `description: ${data.description || ''}`,
          data.model ? `model: ${data.model}` : '',
          data.tools && data.tools.length > 0 ? 'tools:' : '',
          ...(data.tools || []).map((t) => `  - ${t}`),
          data.thinkingLevel ? `thinkingLevel: ${data.thinkingLevel}` : '',
          data.maxTurns ? `maxTurns: ${data.maxTurns}` : '',
          data.maxTokens ? `maxTokens: ${data.maxTokens}` : '',
          data.permissionMode ? `permissionMode: ${data.permissionMode}` : '',
          '---',
        ].filter((l) => l !== '').join('\n')

        const md = `${frontmatter}\n\n${data.systemPrompt || ''}`
        const safeName = agentName.replace(/[^\w.-]+/g, '_')
        const filePath = path.join(agentsDir, `${safeName}.md`)
        fs.writeFileSync(filePath, md, 'utf-8')

        // Reload so the new agent is available immediately
        const def = loadAgentDefinition(safeName, projectDir)

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, path: filePath, agent: def }))
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
      }
    }).catch((e) => {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    })
    return true
  }

  // DELETE /subagents/:name — delete a user sub-agent .md file
  if (req.method === 'DELETE' && subagentSaveMatch) {
    const agentName = decodeURIComponent(subagentSaveMatch[1])
    const projectDir = url.searchParams.get('projectDir') || runtimeConfig.workspaceDir || DATA_DIR
    const agentsDir = path.join(projectDir, '.s-loop', 'agents')
    const safeName = agentName.replace(/[^\w.-]+/g, '_')
    const filePath = path.join(agentsDir, `${safeName}.md`)

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Agent not found' }))
      }
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    }
    return true
  }

  return false
}
