import {
  checkDangerousCommand,
  checkHardlineCommand,
  checkSensitivePath,
} from './security.mjs'
import { checkToolWorkspace, getToolPathArguments, resolveSandboxPath } from './sandbox.mjs'

const APPROVAL_CATEGORIES = new Set(['bash', 'edit', 'mcp'])
const WRITE_CATEGORIES = new Set(['edit'])

export function getToolCategory(toolName, { isMcp = false } = {}) {
  const lower = String(toolName || '').toLowerCase()
  if (isMcp || lower.startsWith('mcp_sse_') || lower.startsWith('mcp_http_')) return 'mcp'
  if (lower.includes('bash') || lower.includes('shell') || lower.includes('exec')) return 'bash'
  if (lower.includes('write') || lower.includes('edit') || lower.includes('delete') || lower.includes('remove')) return 'edit'
  if (lower.includes('grep')) return 'grep'
  if (lower.includes('find') || lower.includes('glob')) return 'glob'
  if (lower === 'ls' || lower.includes('list')) return 'list'
  if (lower.includes('web_search')) return 'websearch'
  if (lower.includes('web_fetch')) return 'webfetch'
  if (lower.includes('read')) return 'read'
  if (lower.includes('skill')) return 'skill'
  return lower
}

export function checkToolPermission(toolName, rules = {}, mode = 'ask', options = {}) {
  const effectiveMode = mode || 'ask'
  if (effectiveMode === 'allow') return { allowed: true }
  if (effectiveMode === 'deny') {
    return { allowed: false, reason: 'Permission denied: agent policy is deny-all' }
  }

  const category = getToolCategory(toolName, options)
  const action = rules?.[toolName] ?? rules?.[category]
  if (action === 'deny') {
    return { allowed: false, reason: `Permission denied: ${toolName} is blocked by agent rules` }
  }
  if (action === 'allow') return { allowed: true }
  if (action === 'ask' || APPROVAL_CATEGORIES.has(category)) {
    return {
      allowed: false,
      approvalRequired: true,
      reason: `${toolName} requires explicit approval`,
    }
  }
  return { allowed: true }
}

export function evaluateToolCall(toolCall, config = {}) {
  const toolName = toolCall?.name || ''
  const args = toolCall?.arguments || {}
  const isMcp = config.isMcp === true || config.mcpToolNames?.has?.(toolName)
  const category = getToolCategory(toolName, { isMcp })

  if (category === 'bash') {
    const command = args.command || args.cmd || ''
    const hardline = checkHardlineCommand(command)
    if (hardline.blocked) return { allowed: false, reason: hardline.reason }
  }

  if (!isMcp) {
    const workspaceRoots = [
      ...(Array.isArray(config.workspaceRoots) ? config.workspaceRoots : []),
      ...(Array.isArray(config.accessiblePaths) ? config.accessiblePaths : []),
    ]
    const workspace = checkToolWorkspace(
      toolName,
      args,
      config.workspaceDir || process.cwd(),
      workspaceRoots,
      WRITE_CATEGORIES.has(category) ? 'read-write' : 'read',
    )
    if (!workspace.allowed) return workspace

    if (WRITE_CATEGORIES.has(category)) {
      for (const filePath of getToolPathArguments(toolName, args)) {
        const sensitive = checkSensitivePath(resolveSandboxPath(filePath, config.workspaceDir || process.cwd()) || filePath)
        if (sensitive.blocked) {
          return {
            allowed: false,
            reason: `Write blocked: ${sensitive.label}. This host path cannot be modified by the AI.`,
          }
        }
      }
    }
  }

  const permission = checkToolPermission(toolName, config.permissionRules, config.permissionMode, { isMcp })
  if (!permission.allowed) {
    const dangerous = checkDangerousCommand(args.command || args.cmd || '')
    if (permission.approvalRequired && category === 'bash' && dangerous.dangerous) {
      return {
        ...permission,
        reason: `Dangerous command pattern: ${dangerous.label}`,
      }
    }
    return permission
  }

  return { allowed: true }
}
