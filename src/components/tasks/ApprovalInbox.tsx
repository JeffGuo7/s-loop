import { Check, ShieldAlert, X } from 'lucide-react'
import { useApprovalStore } from '../../stores/approvalStore'

function formatArguments(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args)
  } catch {
    return '[unavailable]'
  }
}

export function ApprovalInbox() {
  const approvals = useApprovalStore((state) => state.approvals)
  const error = useApprovalStore((state) => state.error)
  const decide = useApprovalStore((state) => state.decide)

  if (approvals.length === 0 && !error) return null

  return (
    <section className="mx-4 mt-5 shrink-0 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 sm:mx-6 lg:mx-8">
      <div className="flex items-center gap-2">
        <ShieldAlert size={16} className="text-amber-500" />
        <div>
          <h2 className="text-[13px] font-black text-text">Approvals / 待审批</h2>
          <p className="text-[10px] text-text-tertiary">
            无人值守任务已暂停，批准前不会执行下面的工具。
          </p>
        </div>
      </div>

      {error && <p className="mt-3 text-[11px] text-red-500">{error}</p>}

      <div className="mt-3 space-y-2">
        {approvals.map((approval) => (
          <div
            key={approval.id}
            className="flex items-start gap-3 rounded-xl border border-border-light bg-surface/80 p-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] font-bold text-text">
                  {approval.toolName}
                </span>
                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-600">
                  {approval.risk}
                </span>
                <span className="text-[9px] text-text-quaternary">
                  {approval.surface}{approval.surfaceId ? ` · ${approval.surfaceId}` : ''}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-text-tertiary">{approval.reason}</p>
              {approval.resolvedTargets.length > 0 && (
                <p className="mt-1 truncate font-mono text-[9px] text-text-quaternary">
                  {approval.resolvedTargets.join(' · ')}
                </p>
              )}
              <p className="mt-1 truncate font-mono text-[9px] text-text-quaternary">
                {formatArguments(approval.args)}
              </p>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button
                onClick={() => decide(approval.id, 'approve')}
                className="inline-flex items-center gap-1 rounded-lg bg-green-500 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-green-600"
              >
                <Check size={12} />
                批准
              </button>
              <button
                onClick={() => decide(approval.id, 'deny')}
                className="inline-flex items-center gap-1 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-[10px] font-bold text-red-500 hover:bg-red-500/20"
              >
                <X size={12} />
                拒绝
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
