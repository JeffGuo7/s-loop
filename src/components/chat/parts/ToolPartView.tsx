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
    <div className="my-4">
      <div className={`rounded-2xl border transition-all duration-300 ${
        expanded 
          ? 'border-(--color-accent) shadow-md' 
          : 'border-(--color-border) hover:border-(--color-accent-light)/50'
      } bg-(--color-surface) overflow-hidden`}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-4 px-4 py-3 hover:bg-(--color-surface-secondary)/70 transition-colors text-left"
        >
          <div className={`p-2.5 rounded-xl ${
            expanded || isRunning ? 'bg-(--color-accent) text-white' : 'bg-(--color-surface-secondary) text-(--color-accent) shadow-sm'
          } transition-colors`}>
            <Icon size={16} strokeWidth={2.5} />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-(--color-text-secondary) opacity-60">
                Tool Call
              </span>
              <span className="text-sm font-bold text-(--color-text-primary)">
                {toolName.replace(/_/g, ' ')}
              </span>
              {isRunning && (
                <div className="flex gap-1">
                  <div className="w-1 h-1 bg-(--color-accent) rounded-full animate-pulse" />
                  <div className="w-1 h-1 bg-(--color-accent) rounded-full animate-pulse [animation-delay:0.2s]" />
                  <div className="w-1 h-1 bg-(--color-accent) rounded-full animate-pulse [animation-delay:0.4s]" />
                </div>
              )}
            </div>
            {subtitle && (
              <div className="text-[11px] text-(--color-text-tertiary) truncate mt-1 font-mono opacity-80" style={{ maxWidth: 'calc(100% - 24px)' }}>
                {subtitle}
              </div>
            )}
          </div>

          <div className={`transition-transform duration-300 mr-1 ${expanded ? 'rotate-180' : ''}`}>
            <ChevronDown size={14} className="text-(--color-text-tertiary)" />
          </div>
        </button>

        {expanded && (
          <div className="border-t border-(--color-border) bg-(--color-surface-secondary)/40 animate-slide-up">
            <div className="p-5 space-y-4">
              {/* Input Args if available */}
              <div className="space-y-2">
                <span className="text-[9px] font-bold uppercase tracking-widest text-(--color-text-tertiary) ml-1">Arguments</span>
                <pre className="font-mono text-[11px] leading-relaxed bg-(--color-surface) border border-(--color-border) rounded-2xl p-4 overflow-x-auto text-(--color-text-secondary)">
                  {JSON.stringify(state?.input || {}, null, 2)}
                </pre>
              </div>

              {output && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className={`text-[9px] font-bold uppercase tracking-widest ${isError ? 'text-(--color-error)' : 'text-(--color-text-tertiary)'}`}>
                      {isError ? 'Error Output' : 'Result Output'}
                    </span>
                    <CopyButton text={output} />
                  </div>
                  <pre className={`font-mono text-[11px] leading-relaxed whitespace-pre-wrap max-h-[400px] overflow-y-auto rounded-2xl p-4 border ${
                    isError 
                      ? 'bg-(--color-error-bg) border border-(--color-error)/20 text-(--color-error)' 
                      : 'bg-(--color-surface) border border-(--color-border) text-(--color-text-secondary)'
                  }`}>
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
