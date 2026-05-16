import { useState } from 'react'
import { Wrench, FileText, Terminal, Globe, Database, FolderOpen } from 'lucide-react'
import { StatusIndicator } from '../shared/StatusIndicator'
import { CopyButton } from '../shared/CopyButton'
import type { ToolCallPart, ToolState } from '../../../types'

interface ToolPartViewProps {
  part: ToolCallPart
}

const TOOL_ICONS: Record<string, typeof Wrench> = {
  read_file: FileText,
  write_to_file: FileText,
  apply_diff: FileText,
  replace_in_file: FileText,
  list_files: FolderOpen,
  list_directory: FolderOpen,
  search_files: FolderOpen,
  codebase_search: FolderOpen,
  execute_command: Terminal,
  run_command: Terminal,
  browser_action: Globe,
  navigate: Globe,
  fetch: Globe,
  web_fetch: Globe,
  web_search: Globe,
  ask_followup: Globe,
  attempt_completion: Globe,
  new_task: Globe,
  use_mcp_tool: Database,
  access_mcp_resource: Database,
  insert_content: FileText,
  search_and_replace: FileText,
}

function getToolIcon(toolName: string): typeof Wrench {
  const lower = toolName.toLowerCase()
  for (const [key, icon] of Object.entries(TOOL_ICONS)) {
    if (lower.includes(key)) return icon
  }
  return Wrench
}

function getToolSubtitle(part: ToolCallPart): string | null {
  const input = part.input as Record<string, unknown> | undefined
  if (!input) return null

  if (typeof input.path === 'string') return input.path
  if (typeof input.filePath === 'string') return input.filePath
  if (typeof input.file_path === 'string') return input.file_path
  if (typeof input.command === 'string') return `$ ${input.command}`
  if (typeof input.url === 'string') return input.url
  if (typeof input.query === 'string') return String(input.query).slice(0, 60)
  if (typeof input.pattern === 'string') return input.pattern

  return null
}

function formatOutput(output: unknown): string {
  if (typeof output === 'string') return output
  if (output === null || output === undefined) return ''
  try {
    return JSON.stringify(output, null, 2)
  } catch {
    return String(output)
  }
}

export function ToolPartView({ part }: ToolPartViewProps) {
  const [expanded, setExpanded] = useState(false)
  const Icon = getToolIcon(part.name)
  const subtitle = getToolSubtitle(part)
  const output = formatOutput(part.output)

  return (
    <div className="my-2 rounded-lg border border-[var(--color-border)]/50 bg-[var(--color-surface-dim)] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-[var(--color-border)]/20 transition-colors text-left"
      >
        <Icon size={15} className="text-[var(--color-primary)] shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[var(--color-text-primary)] truncate">
            {part.name}
          </div>
          {subtitle && (
            <div className="text-[11px] text-[var(--color-text-tertiary)] truncate mt-0.5 font-mono">
              {subtitle}
            </div>
          )}
        </div>
        <StatusIndicator state={part.state as ToolState} size={14} />
        <span
          className="text-[var(--color-text-tertiary)] text-[10px] transition-transform duration-200"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          ▼
        </span>
      </button>

      {expanded && output && (
        <div className="border-t border-[var(--color-border)]/30 px-3 py-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-[var(--color-text-tertiary)]">Output</span>
            <CopyButton text={output} label="Copy" />
          </div>
          <pre className="font-mono text-[11px] leading-relaxed text-[var(--color-text-secondary)] whitespace-pre-wrap max-h-[300px] overflow-y-auto bg-[var(--color-surface)] rounded-lg p-3">
            {output}
          </pre>
        </div>
      )}
    </div>
  )
}