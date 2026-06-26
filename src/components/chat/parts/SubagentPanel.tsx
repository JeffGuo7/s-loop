import { useState } from 'react'
import { ChevronDown, ChevronRight, Bot, Wrench, AlertCircle, Check, X, Clock } from 'lucide-react'
import type { ToolPart } from '../../../types'

interface SubagentEvent {
  agentName: string
  type: 'message_start' | 'text_delta' | 'thinking_delta' | 'message_end' | 'tool_start' | 'tool_end'
  delta?: string
  toolName?: string
  args?: Record<string, unknown>
  result?: unknown
  isError?: boolean
}

interface SubagentResult {
  agent?: string
  exitCode?: number
  usage?: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    cost: number
    turns: number
  }
  model?: string
  stopReason?: string
  results?: SubagentResult[]  // for parallel
}

interface SubagentPanelProps {
  part: ToolPart
  /** Live streaming events (during execution) */
  liveEvents?: SubagentEvent[]
}

function formatTokens(count: number): string {
  if (count < 1000) return String(count)
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`
  return `${Math.round(count / 1000)}k`
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `< $0.01`
  return `$${cost.toFixed(2)}`
}

/** Extract structured sub-agent result from tool part state */
function parseResult(part: ToolPart): SubagentResult | null {
  if (part.state.status === 'completed' && part.state.output) {
    try {
      return JSON.parse(part.state.output)
    } catch {
      return null
    }
  }
  return null
}

export function SubagentPanel({ part, liveEvents }: SubagentPanelProps) {
  const [showToolCalls, setShowToolCalls] = useState(false)

  const isRunning = part.state.status === 'running'
  const isError = part.state.status === 'error'
  const result = parseResult(part)

  // For delegate_parallel, show multiple results
  const isParallel = part.name === 'delegate_parallel'
  const parallelResults: SubagentResult[] = result?.results || []
  const hasParallel = isParallel && parallelResults.length > 0

  if (isRunning && (!liveEvents || liveEvents.length === 0)) {
    return (
      <div className="flex items-center gap-2 px-1 py-1 text-xs text-text-tertiary">
        <Clock size={12} className="animate-spin-slow text-accent" />
        <span>Waiting for sub-agent...</span>
      </div>
    )
  }

  if (isRunning && liveEvents && liveEvents.length > 0) {
    // Live streaming view
    const textEvents = liveEvents.filter(e => e.type === 'text_delta')
    const toolEvents = liveEvents.filter(e => e.type === 'tool_start' || e.type === 'tool_end')
    const accumulated = textEvents.map(e => e.delta || '').join('')

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-1 text-xs">
          <Clock size={12} className="animate-spin-slow text-accent" />
          <span className="font-medium text-accent">{liveEvents[0]?.agentName || 'sub-agent'}</span>
          <span className="text-text-tertiary">running...</span>
        </div>
        {accumulated && (
          <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap max-h-[200px] overflow-y-auto rounded-[8px] p-3 bg-surface border border-black/[0.04] dark:border-white/[0.04] text-text-secondary">
            {accumulated}
          </pre>
        )}
        {toolEvents.length > 0 && (
          <button
            onClick={() => setShowToolCalls(!showToolCalls)}
            className="flex items-center gap-1 px-1 text-[10px] text-text-tertiary hover:text-text transition-colors"
          >
            {showToolCalls ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            <Wrench size={10} />
            <span>{toolEvents.length / 2} tool calls</span>
          </button>
        )}
        {showToolCalls && toolEvents.filter(e => e.type === 'tool_start').map((e, i) => (
          <div key={i} className="flex items-center gap-1.5 px-2 text-[10px] text-text-tertiary">
            <Wrench size={9} />
            <span className="font-medium">{e.toolName}</span>
          </div>
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex items-start gap-2 px-1 py-1">
        <X size={14} className="text-red-500 shrink-0 mt-0.5" />
        <div className="text-xs text-red-500">
          <span className="font-medium">Sub-agent failed:</span>{' '}
          {part.state.status === 'error' ? (part.state as any).error || 'Unknown error' : 'Execution error'}
        </div>
      </div>
    )
  }

  // ─── Completed view ──────────────────────────────────────────

  // Parallel results
  if (hasParallel) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1 text-xs">
          <Bot size={12} className="text-accent" />
          <span className="font-medium text-text">Parallel: {parallelResults.length} tasks</span>
          <span className="text-text-tertiary">
            ({parallelResults.filter(r => (r.exitCode ?? 0) === 0).length} succeeded)
          </span>
        </div>
        {parallelResults.map((r, i) => (
          <SubagentResultCard key={i} result={r} index={i} />
        ))}
      </div>
    )
  }

  // Single result
  if (result) {
    return <SubagentResultCard result={result} />
  }

  // Fallback: plain text output
  return null
}

function SubagentResultCard({ result, index }: { result: SubagentResult; index?: number }) {
  const [expanded, setExpanded] = useState(false)
  const isOk = (result.exitCode ?? 0) === 0
  const agentName = result.agent || (index !== undefined ? `task-${index + 1}` : 'sub-agent')
  const output = (result as any).finalOutput || ''

  return (
    <div className="rounded-[8px] border border-black/[0.04] dark:border-white/[0.04] bg-surface-secondary/40 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-secondary/60 transition-colors text-left"
      >
        <div className={`p-1 rounded-[4px] ${
          isOk ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
        }`}>
          {isOk ? <Check size={10} strokeWidth={3} /> : <X size={10} strokeWidth={3} />}
        </div>
        <span className="text-xs font-medium text-text flex-1">{agentName}</span>
        {result.usage && (
          <span className="text-[9px] text-text-tertiary font-mono">
            {formatTokens(result.usage.input + result.usage.output)} tokens
            {result.usage.turns > 0 && ` · ${result.usage.turns} turns`}
            {result.usage.cost > 0 && ` · ${formatCost(result.usage.cost)}`}
          </span>
        )}
        {result.model && (
          <span className="text-[9px] text-text-quaternary">{result.model}</span>
        )}
        {output && (
          <ChevronRight size={12} className={`text-text-tertiary transition-transform ${expanded ? 'rotate-90' : ''}`} />
        )}
      </button>

      {/* Expanded output */}
      {expanded && output && (
        <div className="border-t border-black/[0.04] dark:border-white/[0.04] px-3 py-2">
          <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap max-h-[300px] overflow-y-auto text-text-secondary">
            {output}
          </pre>
        </div>
      )}

      {/* Error display */}
      {!isOk && (result as any).errorMessage && (
        <div className="border-t border-red-500/10 px-3 py-2 bg-red-500/[0.02]">
          <div className="flex items-start gap-2">
            <AlertCircle size={12} className="text-red-500 shrink-0 mt-0.5" />
            <span className="text-xs text-red-500">{(result as any).errorMessage}</span>
          </div>
        </div>
      )}
    </div>
  )
}
