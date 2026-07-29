export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'resuming'
  | 'completed'
  | 'denied'
  | 'failed'
  | 'interrupted'

export interface ApprovalRequest {
  id: string
  status: ApprovalStatus
  surface: string
  surfaceId?: string
  sessionId?: string
  runId?: string
  toolCallId?: string
  toolName: string
  args: Record<string, unknown>
  reason: string
  risk: 'read' | 'write-local' | 'exec' | 'external'
  source: 'builtin' | 'extension' | 'skill' | 'mcp'
  matchedRule: string
  resolvedTargets: string[]
  createdAt: number
  updatedAt: number
}
