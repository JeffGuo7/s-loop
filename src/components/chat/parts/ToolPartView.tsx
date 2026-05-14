import { Wrench } from 'lucide-react'
import { Collapsible, StatusIndicator, Markdown } from '../shared'
import type { ToolPart } from '../../../types'

interface ToolPartViewProps {
  part: ToolPart
  verbose?: boolean
}

export function ToolPartView({ part, verbose = false }: ToolPartViewProps) {
  const toolName = part.tool || 'unknown'
  const statusColor = {
    pending: 'text-yellow-500',
    running: 'text-blue-500',
    completed: 'text-green-500',
    error: 'text-red-500',
  }[part.state]

  const header = (
    <span className="flex items-center gap-2">
      <Wrench size={14} className={statusColor} />
      <StatusIndicator state={part.state} />
      <span className="font-mono text-sm">{toolName}</span>
      {part.title && <span className="text-xs text-[var(--color-text-secondary)]">— {part.title}</span>}
    </span>
  )

  // Show input/output in verbose mode or when there's output
  const showDetails = verbose || part.state === 'completed' || part.state === 'error'

  if (!showDetails) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-surface-dim)] rounded-lg my-1">
        {header}
      </div>
    )
  }

  return (
    <Collapsible header={header} defaultExpanded={part.state === 'error'} className="my-2">
      <div className="space-y-2 text-sm">
        {/* Input */}
        {part.input && Object.keys(part.input).length > 0 && (
          <div>
            <span className="text-xs text-[var(--color-text-secondary)] uppercase">Input:</span>
            <pre className="mt-1 p-2 bg-[var(--color-surface-dim)] rounded overflow-x-auto text-xs">
              {JSON.stringify(part.input, null, 2)}
            </pre>
          </div>
        )}

        {/* Output */}
        {part.state === 'completed' && part.output && (
          <div>
            <span className="text-xs text-[var(--color-text-secondary)] uppercase">Output:</span>
            <div className="mt-1 p-2 bg-[var(--color-surface-dim)] rounded max-h-64 overflow-auto">
              <Markdown>{part.output}</Markdown>
            </div>
          </div>
        )}

        {/* Error */}
        {part.state === 'error' && part.error && (
          <div className="p-2 bg-red-500/10 border border-red-500/20 rounded text-red-500 text-xs">
            {part.error}
          </div>
        )}
      </div>
    </Collapsible>
  )
}