import {
  completeApproval,
  consumeApprovedApproval,
  createApprovalRequest,
  waitForApproval,
} from '../approval-store.mjs'

/**
 * Durable approval bridge for a single Goal Loop run.
 *
 * The coordinator is intentionally independent from the Agent implementation:
 * callers pass it the already-evaluated policy decision, and use the returned
 * value as the Agent's beforeToolCall result.
 */
export function createGoalApprovalCoordinator({
  goalState,
  runId,
  resumeApprovalId,
  signal,
  persistFn,
  onUpdate,
}) {
  const executingApprovals = new Map()
  let approvalToResume = resumeApprovalId

  const persistState = (updates) => {
    Object.assign(goalState, updates)
    if (persistFn) persistFn(goalState)
  }

  return {
    async request(toolCall, decision) {
      if (approvalToResume) {
        const resumed = consumeApprovedApproval(approvalToResume, {
          surface: 'goal',
          surfaceId: goalState.id,
          toolName: toolCall.name,
          args: toolCall.arguments || {},
          toolCallId: toolCall.id,
        })
        if (resumed) {
          executingApprovals.set(toolCall.id, resumed.id)
          approvalToResume = undefined
          persistState({
            status: 'running',
            pendingApprovalId: undefined,
          })
          onUpdate?.({
            type: 'goal_resumed',
            approvalId: resumed.id,
            goalState,
          })
          return undefined
        }
      }

      const approval = createApprovalRequest({
        surface: 'goal',
        surfaceId: goalState.id,
        runId,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        args: toolCall.arguments || {},
        reason: decision.reason,
        risk: decision.risk,
        source: decision.source,
        matchedRule: decision.matchedRule,
        resolvedTargets: decision.resolvedTargets,
      })
      persistState({
        status: 'waiting_for_approval',
        pendingApprovalId: approval.id,
      })
      onUpdate?.({
        type: 'goal_waiting_for_approval',
        approvalId: approval.id,
        toolName: toolCall.name,
        goalState,
      })

      const approved = await waitForApproval(approval.id, { signal })
      if (!approved) {
        return {
          block: true,
          reason: `Approval denied or interrupted for ${toolCall.name}`,
          approvalDenied: true,
        }
      }

      executingApprovals.set(toolCall.id, approval.id)
      persistState({
        status: 'running',
        pendingApprovalId: undefined,
      })
      onUpdate?.({
        type: 'goal_resumed',
        approvalId: approval.id,
        goalState,
      })
      return undefined
    },

    complete(toolCall, result) {
      const approvalId = executingApprovals.get(toolCall?.id)
      if (!approvalId) return
      executingApprovals.delete(toolCall.id)
      completeApproval(approvalId, result?.isError ? 'failed' : 'completed')
    },
  }
}
