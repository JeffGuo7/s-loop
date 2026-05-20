import { useState } from 'react'
import { Wrench, FileText, Terminal, Globe, Database, FolderOpen, ChevronDown } from 'lucide-react'
import { CopyButton } from '../shared/CopyButton'
import type { ToolPart } from '../../../types'

interface ToolPartViewProps {
  part: ToolPart
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

function getToolSubtitle(part: ToolPart): string | null {
  const state = part.state as Record<string, unknown>
  const input = state?.input as Record<string, unknown> | undefined
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
  const toolName = part.name || part.tool
  const Icon = getToolIcon(toolName)
  const subtitle = getToolSubtitle(part)
  const state = part.state as Record<string, unknown>
  const output = formatOutput(state?.output || state?.error)
  const isError = !!state?.error
  const isRunning = state?.status === 'running'

  return (
    <div className="my-2">
      <div className={`rounded-2xl border transition-all duration-300 ${
        expanded 
          ? 'border-[var(--color-accent)] shadow-sm' 
          : 'border-[var(--color-border)] hover:border-[var(--color-border-hover)]'
      } bg-[var(--color-surface)] overflow-hidden`}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-4 px-4 py-2.5 hover:bg-[var(--color-surface-secondary)]/30 transition-colors text-left"
        >
          <div className={`p-2 rounded-xl ${
            expanded || isRunning ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-surface-secondary)] text-[var(--color-text-tertiary)]'
          } transition-colors`}>
            <Icon size={14} strokeWidth={2.5} />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--color-text-tertiary)]">
                Tool Call
              </span>
              <span className="text-[13px] font-bold text-[var(--color-text)]">
                {toolName.replace(/_/g, ' ')}
              </span>
              {isRunning && (
                <div className="flex gap-1">
                  <div className="w-1 h-1 bg-[var(--color-accent)] rounded-full animate-pulse" />
                  <div className="w-1 h-1 bg-[var(--color-accent)] rounded-full animate-pulse [animation-delay:0.2s]" />
                  <div className="w-1 h-1 bg-[var(--color-accent)] rounded-full animate-pulse [animation-delay:0.4s]" />
                </div>
              )}
            </div>
            {subtitle && (
              <div className="text-[11px] text-[var(--color-text-tertiary)] truncate mt-0.5 font-mono opacity-80" style={{ maxWidth: 'calc(100% - 24px)' }}>
                {subtitle}
              </div>
            )}
          </div>

          <div className={`transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}>
            <ChevronDown size={14} className="text-[var(--color-text-tertiary)]" />
          </div>
        </button>

        {expanded && (
          <div className="border-t border-[var(--color-border-light)] bg-[var(--color-bg)]/50 animate-fade-in">
            <div className="p-4 space-y-4">
              {/* Input Args if available */}
              <div className="space-y-2">
                <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] ml-1">Arguments</span>
                <pre className="font-mono text-[11px] leading-relaxed bg-[var(--color-surface)] border border-[var(--color-border-light)] rounded-xl p-3 overflow-x-auto text-[var(--color-text-secondary)] scrollbar-subtle">
                  {JSON.stringify(state?.input || {}, null, 2)}
                </pre>
              </div>

              {output && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className={`text-[9px] font-bold uppercase tracking-widest ${isError ? 'text-[var(--color-error)]' : 'text-[var(--color-text-tertiary)]'}`}>
                      {isError ? 'Error Output' : 'Result Output'}
                    </span>
                    <CopyButton text={output} />
                  </div>
                  <pre className={`font-mono text-[11px] leading-relaxed whitespace-pre-wrap max-h-[400px] overflow-y-auto rounded-xl p-3 border ${
                    isError 
                      ? 'bg-[var(--color-error-bg)] border border-[var(--color-error)]/20 text-[var(--color-error)]' 
                      : 'bg-[var(--color-surface)] border border-[var(--color-border-light)] text-[var(--color-text-secondary)]'
                  } scrollbar-subtle`}>
                    {output}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
