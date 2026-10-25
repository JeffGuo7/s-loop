import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { ShieldAlert } from 'lucide-react'

export interface ToolApprovalRequest {
  requestId: string
  toolName: string
  args: any
  reason?: string
  piSessionId: string
}

export function ToolApprovalDialog({
  approval,
  onRespond,
}: {
  approval: ToolApprovalRequest
  onRespond: (approved: boolean) => void
}) {
  const { t } = useTranslation()
  return (
      
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-md" onClick={() => { onRespond(false) }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-sm bg-white dark:bg-surface rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top accent bar */}
            <div className="h-1.5 bg-gradient-to-r from-amber-400 to-amber-500" />

            <div className="p-6 pb-5">
              <div className="flex items-start gap-4 mb-5">
                <div className="relative shrink-0">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center ring-1 ring-amber-500/20">
                    <ShieldAlert size={18} className="text-amber-500" />
                  </div>
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-500 animate-pulse" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-bold text-text tracking-tight">{t('chat.toolApproval.title')}</h3>
                  <p className="text-[12px] text-text-tertiary mt-0.5">{t('chat.toolApproval.subtitle')}</p>
                </div>
              </div>

              {/* Tool card */}
              <div className="rounded-xl bg-surface-secondary/40 border border-border-light/60 p-4 mb-5">
                <div className="flex items-center gap-2.5 mb-3">
                  <code className="text-[13px] font-bold text-accent font-mono">{approval.toolName}</code>
                  <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/15">{t('chat.toolApproval.dangerous')}</span>
                </div>
                {approval.reason && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-3 leading-relaxed">
                    {approval.reason}
                  </p>
                )}
                {approval.args && (
                  <div>
                    <pre className="text-[11px] font-mono text-text-secondary/80 bg-surface border border-border-light/40 rounded-lg p-3 max-h-36 overflow-auto whitespace-pre-wrap leading-relaxed">
                      {JSON.stringify(approval.args, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2.5">
                <button onClick={() => { onRespond(false) }}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-border-light text-[12px] font-semibold text-text-tertiary hover:text-text hover:bg-surface-secondary/60 transition-all">
                  {t('chat.toolApproval.cancel')}
                </button>
                <button onClick={() => { onRespond(false) }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-surface text-[12px] font-semibold text-red-500 border border-red-500/20 hover:bg-red-500/5 transition-all">
                  {t('chat.toolApproval.reject')}
                </button>
                <button onClick={() => { onRespond(true) }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-accent text-white text-[12px] font-bold shadow-md shadow-accent/20 hover:shadow-lg transition-all">
                  {t('chat.toolApproval.approve')}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
  )
}
