import { useState } from 'react'
import { Wrench, FileText, Terminal, Globe, Database, FolderOpen, ChevronDown, Activity } from 'lucide-react'
import { CopyButton } from '../shared/CopyButton'
import { Card } from '../../ui'
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
  const state = part.state as Record<string, unknown>
  const output = formatOutput(state?.output || state?.error)
  const isError = !!state?.error
  const isRunning = state?.status === 'running'

  return (
    <div className="my-1 animate-fade-in">
      <Card
        className={`overflow-hidden transition-all duration-700 border border-black/[0.04] dark:border-white/[0.04] rounded-[12px] ${
          expanded ? 'ring-2 ring-accent/20 shadow-md' : 'hover:border-accent/30 bg-surface-secondary/30'
        }`}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-3 px-4 py-2 hover:bg-surface-secondary/60 transition-all text-left group/toolbtn"
        >
          <div className={`p-1.5 rounded-[8px] transition-all duration-500 ${
            isRunning 
              ? 'bg-accent text-white animate-pulse' 
              : expanded 
                ? 'bg-accent text-white' 
                : 'bg-surface-tertiary text-text-tertiary group-hover/toolbtn:text-text'
          }`}>
            {isRunning ? <Activity size={12} strokeWidth={3} className="animate-spin-slow" /> : <Icon size={12} strokeWidth={3} />}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-[9px] font-bold uppercase tracking-[0.15em] opacity-40 ${isRunning ? 'text-accent' : 'text-text-tertiary'}`}>
                {isRunning ? 'Executing' : isError ? 'Failed' : 'Call'}
              </span>
              <span className="text-[13px] font-bold text-text truncate tracking-tight">
                {toolName.replace(/_/g, ' ')}
              </span>
            </div>
          </div>

          <div className={`transition-all duration-500 ${expanded ? 'rotate-180 text-accent' : 'text-text-quaternary group-hover/toolbtn:text-text-secondary'}`}>
            <ChevronDown size={16} strokeWidth={3} />
          </div>
        </button>

        {expanded && (
          <div className="border-t border-black/[0.04] dark:border-white/[0.04] bg-surface-secondary/40 animate-fade-in">
            <div className="p-4 space-y-4">
              {/* Output Only to keep it simple and stacked */}
              {output && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className={`text-[9px] font-bold uppercase tracking-[0.2em] ${isError ? 'text-red-500/80' : 'text-text-tertiary'}`}>
                      {isError ? 'Error' : 'Result'}
                    </span>
                    <CopyButton text={output} />
                  </div>
                  <pre className={`font-mono text-[11px] leading-relaxed whitespace-pre-wrap max-h-[250px] overflow-y-auto rounded-[8px] p-3 border shadow-inner ${
                    isError 
                      ? 'bg-red-500/5 border-red-500/10 text-red-500/90' 
                      : 'bg-surface border-black/[0.04] dark:border-white/[0.04] text-text-secondary'
                  } scrollbar-subtle`}>
                    {output}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

