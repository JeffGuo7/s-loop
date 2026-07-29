import {
  checkDangerousCommand,
  checkHardlineCommand,
  checkSensitivePath,
} from './security.mjs'
import {
  checkWorkspacePath,
  getDeclaredPathArguments,
  resolveSandboxPath,
} from './sandbox.mjs'
import { resolveToolSecurity } from './tool-security.mjs'

function makeDecision(outcome, metadata, options = {}) {
  return {
    outcome,
    allowed: outcome === 'allow',
    approvalRequired: outcome === 'approval-required',
    toolName: options.toolName || '',
    risk: metadata.risk,
    source: metadata.source,
    matchedRule: options.matchedRule || 'default',
    resolvedTargets: options.resolvedTargets || [],
    reason: options.reason || (outcome === 'allow' ? 'Allowed by policy' : 'Blocked by policy'),
  }
}

function makePermissionDecision(outcome, reason, matchedRule) {
  return {
    outcome,
    allowed: outcome === 'allow',
    approvalRequired: outcome === 'approval-required',
    reason,
    matchedRule,
  }
}

export function getToolCategory(toolName, { isMcp = false, risk } = {}) {
  if (isMcp || risk === 'external') return 'mcp'
  if (risk === 'exec') return 'bash'
  if (risk === 'write-local') return 'edit'
  const lower = String(toolName || '').toLowerCase()
  if (lower.includes('grep')) return 'grep'
  if (lower.includes('find') || lower.includes('glob')) return 'glob'
  if (lower === 'ls' || lower.includes('list')) return 'list'
  if (lower.includes('web_search')) return 'websearch'
  if (lower.includes('web_fetch')) return 'webfetch'
  if (risk === 'read' || lower.includes('read')) return 'read'
  if (lower.includes('skill')) return 'skill'
  return lower
}

export function checkToolPermission(toolName, rules = {}, mode = 'ask', options = {}) {
  const metadata = options.metadata || resolveToolSecurity(toolName, options).metadata
  const category = getToolCategory(toolName, {
    isMcp: metadata.source === 'mcp',
    risk: metadata.risk,
  })
  const action = rules?.[toolName] ?? rules?.[category]

  if (mode === 'deny') {
    return makePermissionDecision(
      'deny',
      'Permission denied: agent policy is deny-all',
      'mode:deny',
    )
  }
  if (action === 'deny' || metadata.approvalDefault === 'deny') {
    return makePermissionDecision(
      'deny',
      `Permission denied: ${toolName} is blocked by policy`,
      action === 'deny' ? `rule:${toolName}` : 'metadata:deny',
    )
  }
  if (
    action === 'ask'
    || metadata.approvalDefault === 'ask'
    || (mode !== 'allow' && metadata.risk !== 'read')
  ) {
    return makePermissionDecision(
      'approval-required',
      `${toolName} requires explicit approval`,
      action === 'ask'
        ? `rule:${toolName}`
        : metadata.approvalDefault === 'ask'
          ? 'metadata:ask'
          : `mode:${mode}`,
    )
  }
  return makePermissionDecision(
    'allow',
    `${toolName} is allowed`,
    `mode:${mode || 'ask'}`,
  )
}

export function evaluateToolCall(toolCall, config = {}) {
  const toolName = toolCall?.name || ''
  const args = toolCall?.arguments || {}
  const { metadata, declared } = resolveToolSecurity(toolName, config)
  const resolvedTargets = []

  if (metadata.risk === 'exec') {
    const command = args.command || args.cmd || ''
    const hardline = checkHardlineCommand(command)
    if (hardline.blocked) {
      return makeDecision('deny', metadata, {
        toolName,
        matchedRule: 'hardline-command',
        reason: hardline.reason,
      })
    }
  }

  const pathArguments = getDeclaredPathArguments(
    args,
    metadata.pathArguments,
    metadata.pathDefault,
  )
  for (const filePath of pathArguments) {
    const workspace = checkWorkspacePath(
      filePath,
      config.workspaceDir || process.cwd(),
      [
        ...(Array.isArray(config.workspaceRoots) ? config.workspaceRoots : []),
        ...(Array.isArray(config.accessiblePaths) ? config.accessiblePaths : []),
      ],
      metadata.risk === 'write-local' ? 'read-write' : 'read',
    )
    if (workspace.resolvedPath) resolvedTargets.push(workspace.resolvedPath)
    if (!workspace.allowed) {
      return makeDecision('deny', metadata, {
        toolName,
        matchedRule: 'workspace-root',
        resolvedTargets,
        reason: workspace.reason,
      })
    }
  }

  if (metadata.risk === 'write-local') {
    for (const filePath of pathArguments) {
      const resolvedPath = resolveSandboxPath(filePath, config.workspaceDir || process.cwd()) || filePath
      const sensitive = checkSensitivePath(resolvedPath)
      if (sensitive.blocked) {
        return makeDecision('deny', metadata, {
          toolName,
          matchedRule: 'sensitive-host-path',
          resolvedTargets,
          reason: `Write blocked: ${sensitive.label}. This host path cannot be modified by the AI.`,
        })
      }
    }
  }

  if (metadata.targetArgument && args[metadata.targetArgument] !== undefined) {
    resolvedTargets.push(String(args[metadata.targetArgument]))
  }

  if (!declared) {
    if (config.permissionMode === 'deny') {
      return makeDecision('deny', metadata, {
        toolName,
        matchedRule: 'mode:deny',
        resolvedTargets,
        reason: 'Permission denied: agent policy is deny-all',
      })
    }
    return makeDecision('approval-required', metadata, {
      toolName,
      matchedRule: 'missing-security-metadata',
      resolvedTargets,
      reason: `${toolName || 'Unknown tool'} has no trusted security metadata and requires explicit approval`,
    })
  }

  const permission = checkToolPermission(
    toolName,
    config.permissionRules,
    config.permissionMode,
    { metadata },
  )
  if (permission.outcome !== 'allow') {
    let reason = permission.reason
    const dangerous = checkDangerousCommand(args.command || args.cmd || '')
    if (permission.outcome === 'approval-required' && metadata.risk === 'exec' && dangerous.dangerous) {
      reason = `Dangerous command pattern: ${dangerous.label}`
    }
    return makeDecision(permission.outcome, metadata, {
      toolName,
      matchedRule: permission.matchedRule,
      resolvedTargets,
      reason,
    })
  }

  return makeDecision('allow', metadata, {
    toolName,
    matchedRule: permission.matchedRule,
    resolvedTargets,
    reason: permission.reason,
  })
}
