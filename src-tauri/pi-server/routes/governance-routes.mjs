// Governance routes: runtime config, approvals, and the audit trail.
//
// Every handler returns true once it has claimed (or scheduled a response
// for) the request, so the dispatcher in index.mjs can stop matching.

import {
  listApprovals,
  resolveApproval,
} from '../approval-store.mjs'
import {
  listAuditEvents,
  verifyAuditTrail,
} from '../audit-store.mjs'
import { readJsonBody } from '../http-body.mjs'

export function handleGovernanceRoutes(req, res, url, ctx) {
  const { runtimeConfig } = ctx

  if (req.method === 'POST' && url.pathname === '/runtime/config') {
    readJsonBody(req).then((data) => {
      runtimeConfig.providerID = data.providerID || runtimeConfig.providerID
      runtimeConfig.modelID = data.modelID || runtimeConfig.modelID
      runtimeConfig.apiKey = data.apiKey ?? runtimeConfig.apiKey
      runtimeConfig.providerApiKeys = data.providerApiKeys && typeof data.providerApiKeys === 'object'
        ? { ...data.providerApiKeys }
        : runtimeConfig.providerApiKeys
      runtimeConfig.workspaceDir = data.workspaceDir || undefined
      if (data.filesystemAccess === 'workspace' || data.filesystemAccess === 'full') {
        runtimeConfig.filesystemAccess = data.filesystemAccess
      }
      runtimeConfig.thinkingLevel = data.thinkingLevel || runtimeConfig.thinkingLevel
      if (data.providerConfig) runtimeConfig.providerConfig = data.providerConfig
      if (data.webSearchConfig) runtimeConfig.webSearchConfig = data.webSearchConfig
      // Active-agent config for autonomous flows (platform replies, cron)
      runtimeConfig.agentSystemPrompt = data.agentSystemPrompt || undefined
      runtimeConfig.agentSkillsBlock = data.agentSkillsBlock || undefined
      runtimeConfig.agentModel = data.agentModel || undefined
      runtimeConfig.agentMcpServers = Array.isArray(data.agentMcpServers)
        ? [...data.agentMcpServers]
        : undefined
      runtimeConfig.agentMcpTools = Array.isArray(data.agentMcpTools)
        ? data.agentMcpTools.map((tool) => ({ ...tool }))
        : undefined
      runtimeConfig.permissionMode = data.permissionMode || undefined
      runtimeConfig.permissionRules = data.permissionRules || undefined
      runtimeConfig.workspaceRoots = Array.isArray(data.workspaceRoots) ? data.workspaceRoots : []
      // Keep accepting version 0 clients during a rolling upgrade.
      runtimeConfig.accessiblePaths = Array.isArray(data.accessiblePaths) ? data.accessiblePaths : []
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
    }).catch((e) => {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    })
    return true
  }

  if (req.method === 'GET' && url.pathname === '/approvals') {
    const requestedStatus = url.searchParams.getAll('status')
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(listApprovals({
      status: requestedStatus.length > 0 ? requestedStatus : undefined,
    })))
    return true
  }

  if (req.method === 'GET' && url.pathname === '/audit/events') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(listAuditEvents({
      limit: url.searchParams.get('limit') || undefined,
      surface: url.searchParams.get('surface') || undefined,
      runId: url.searchParams.get('runId') || undefined,
    })))
    return true
  }

  if (req.method === 'GET' && url.pathname === '/audit/verify') {
    const result = verifyAuditTrail()
    res.writeHead(result.valid ? 200 : 409, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(result))
    return true
  }

  const approvalDecisionMatch = url.pathname.match(/^\/approvals\/([^/]+)\/decision$/)
  if (req.method === 'POST' && approvalDecisionMatch) {
    readJsonBody(req).then((data) => {
      const result = resolveApproval(
        approvalDecisionMatch[1],
        data.decision,
        'local-user',
      )
      if (!result) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Approval request not found' }))
        return
      }

      resumeAfterDecision(ctx, result, data.decision)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(result.record))
    }).catch((error) => {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message }))
    })
    return true
  }

  return false
}

// Resume (or fail) the parked run that owns an approval after the user
// decides it. Mirrors the surface-specific resume logic per surface kind.
function resumeAfterDecision(ctx, result, decision) {
  const {
    getTask,
    runTask,
    createTaskRunDependencies,
    updateTask,
    getGoal,
    executeGoalRun,
    updateGoal,
    getPlatformRun,
    executePlatformRun,
    updatePlatformRun,
  } = ctx
  const record = result.record
  const shouldResume = (
    decision === 'approve'
    && !result.delivered
    && record.status === 'approved'
  )
  if ((result.changed || shouldResume) && !result.delivered && record.surface === 'task') {
    const task = getTask(record.surfaceId)
    if (shouldResume && task) {
      void runTask(task, createTaskRunDependencies(task, {}, {
        trigger: 'manual',
        resumeApprovalId: record.id,
      })).catch((error) => {
        console.error('[approvals] failed to resume task:', error?.message)
      })
    } else if (decision === 'deny' && task?.pendingApprovalId === record.id) {
      updateTask(task.id, {
        lastStatus: 'failed',
        lastError: `Approval denied for ${record.toolName}`,
        lastFinishedAt: Date.now(),
        pendingApprovalId: undefined,
      })
    }
  }
  if ((result.changed || shouldResume) && !result.delivered && record.surface === 'goal') {
    const goal = getGoal(record.surfaceId)
    if (
      shouldResume
      && goal?.status === 'waiting_for_approval'
      && goal.pendingApprovalId === record.id
    ) {
      void executeGoalRun(goal.id, {
        resumeApprovalId: record.id,
        runId: record.runId || randomUUID(),
      }).catch((error) => {
        updateGoal(goal.id, {
          status: 'failed',
          finalResult: error?.message || String(error),
          pendingApprovalId: undefined,
        })
        console.error('[approvals] failed to resume goal:', error?.message)
      })
    } else if (decision === 'deny' && goal?.pendingApprovalId === record.id) {
      updateGoal(goal.id, {
        status: 'failed',
        finalResult: `Approval denied for ${record.toolName}`,
        pendingApprovalId: undefined,
      })
    }
  }
  if ((result.changed || shouldResume) && !result.delivered && record.surface === 'platform') {
    const platformRun = getPlatformRun(record.surfaceId)
    if (
      shouldResume
      && platformRun?.status === 'waiting_for_approval'
      && platformRun.pendingApprovalId === record.id
    ) {
      void executePlatformRun(platformRun, {
        resumeApprovalId: record.id,
      }).catch((error) => {
        console.error('[approvals] failed to resume platform run:', error?.message)
      })
    } else if (
      decision === 'deny'
      && platformRun?.pendingApprovalId === record.id
    ) {
      updatePlatformRun(platformRun.id, {
        status: 'failed',
        error: `Approval denied for ${record.toolName}`,
        pendingApprovalId: undefined,
      })
    }
  }
}
