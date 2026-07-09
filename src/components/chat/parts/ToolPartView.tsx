import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, CheckCircle2, XCircle } from 'lucide-react'
import { CopyButton } from '../shared/CopyButton'
import { SubagentPanel } from './SubagentPanel'
import type { ToolPart } from '../../../types'

interface ToolPartViewProps {
  part: ToolPart
}

function formatOutput(output: unknown): string {
  if (typeof output === 'string') return output
  if (output === null || output === undefined) return ''
  try { return JSON.stringify(output, null, 2) } catch { return String(output) }
}

export function ToolPartView({ part }: ToolPartViewProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const toolName = (part.name || part.tool || '').replace(/_/g, ' ')
  const state = part.state as Record<string, unknown> || {}
  const output = formatOutput(state?.output || state?.error)
  const isError = !!state?.error || state?.status === 'error'
  const isRunning = state?.status === 'running'

  return (
    <div className="my-px group/disclosure">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-2.5 py-1.5 -mx-2.5 rounded-lg hover:bg-surface-secondary/50 transition-colors text-left"
      >
        {/* Status icon — compact */}
        <span className="shrink-0 w-4 h-4 flex items-center justify-center">
          {isRunning ? (
            <span className="w-3 h-3 rounded-full border-2 border-accent/40 border-t-accent animate-spin" />
          ) : isError ? (
            <XCircle size={14} className="text-red-500" strokeWidth={2} />
          ) : (
            <CheckCircle2 size={14} className="text-green-500" strokeWidth={2} />
          )}
        </span>

        {/* Tool name + status label */}
        <span className="flex-1 min-w-0 flex items-center gap-1.5 text-[11px]">
          <span className={`font-semibold truncate ${isRunning ? 'text-accent' : 'text-text-secondary'}`}>
            {toolName}
          </span>
          <span className={`shrink-0 text-[9px] font-medium ${isRunning ? 'text-accent/60' : isError ? 'text-red-500/60' : 'text-green-500/60'}`}>
            {isRunning ? '…' : isError ? 'failed' : 'done'}
          </span>
        </span>

        {/* Collapse chevron */}
        <ChevronDown
          size={12}
          className={`shrink-0 text-text-quaternary transition-transform ${expanded ? 'rotate-180' : ''} opacity-0 group-hover/disclosure:opacity-100`}
        />
      </button>

      {/* Expanded content */}
      {expanded && output && (
        <div className="pl-6 animate-fade-in">
          <div className="rounded-lg bg-surface-secondary/30 border border-border-light/40 overflow-hidden">
            {['delegate_task', 'delegate_parallel', 'run_subagent'].includes(part.name || part.tool || '') ? (
              <SubagentPanel part={part} />
            ) : (
              <div className="p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[9px] font-semibold uppercase tracking-wide ${isError ? 'text-red-500' : 'text-text-tertiary'}`}>
                    {isError ? t('chat.parts.error') : t('chat.parts.result')}
                  </span>
                  <CopyButton text={output} />
                </div>
                <pre className={`font-mono text-[11px] leading-relaxed whitespace-pre-wrap max-h-[200px] overflow-y-auto rounded-lg p-2.5 ${
                  isError ? 'bg-red-500/5 text-red-500/90' : 'bg-surface text-text-secondary border border-border-light/40'
                }`}>
                  {output}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
