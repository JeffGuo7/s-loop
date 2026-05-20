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
    <div className="my-3 animate-fade-in">
      <Card
        className={`overflow-hidden transition-all duration-500 border border-black/[0.04] dark:border-white/[0.04] ${
          expanded ? 'ring-1 ring-(--color-accent)/20 shadow-md' : 'hover:border-(--color-accent)/20'
        }`}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-4 px-4 py-3 hover:bg-(--color-surface-secondary)/50 transition-all text-left group/toolbtn"
        >
          <div className={`p-2.5 rounded-xl transition-all duration-500 ${
            isRunning 
              ? 'bg-(--color-accent) text-white shadow-lg shadow-accent/20 animate-pulse' 
              : expanded 
                ? 'bg-(--color-accent) text-white shadow-md shadow-accent/10' 
                : 'bg-(--color-surface-secondary) text-(--color-text-tertiary) group-hover/toolbtn:bg-(--color-surface-tertiary)'
          }`}>
            {isRunning ? <Activity size={15} strokeWidth={2.5} className="animate-spin-slow" /> : <Icon size={15} strokeWidth={2.5} />}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5">
              <span className={`text-[10px] font-bold uppercase tracking-[0.15em] opacity-70 ${isRunning ? 'text-(--color-accent)' : 'text-(--color-text-tertiary)'}`}>
                {isRunning ? 'Executing' : isError ? 'Execution Failed' : 'Tool Call'}
              </span>
              <span className="text-[14px] font-semibold text-(--color-text) tracking-tight">
                {toolName.replace(/_/g, ' ')}
              </span>
            </div>
            {subtitle && (
              <div className="text-[11px] text-(--color-text-tertiary) truncate mt-0.5 font-mono opacity-60 group-hover/toolbtn:opacity-90 transition-opacity" style={{ maxWidth: 'calc(100% - 24px)' }}>
                {subtitle}
              </div>
            )}
          </div>

          <div className={`transition-all duration-500 rounded-full p-1.5 ${expanded ? 'rotate-180 bg-(--color-accent-muted) text-(--color-accent)' : 'text-(--color-text-quaternary) group-hover/toolbtn:text-(--color-text-secondary)'}`}>
            <ChevronDown size={16} strokeWidth={2.5} />
          </div>
        </button>

        {expanded && (
          <div className="border-t border-black/[0.03] dark:border-white/[0.03] bg-(--color-surface-secondary)/30 animate-fade-in">
            <div className="p-5 space-y-6">
              {/* Input Args */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 ml-1">
                  <div className="w-1 h-3 rounded-full bg-(--color-accent)/30" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-(--color-text-tertiary)">Input Parameters</span>
                </div>
                <div className="relative group/input">
                  <pre className="font-mono text-[11px] leading-relaxed bg-(--color-surface) border border-black/[0.04] dark:border-white/[0.04] rounded-xl p-4 overflow-x-auto text-(--color-text-secondary) shadow-inner scrollbar-subtle">
                    {JSON.stringify(state?.input || {}, null, 2)}
                  </pre>
                  <div className="absolute top-2 right-2 opacity-0 group-hover/input:opacity-100 transition-opacity">
                    <CopyButton text={JSON.stringify(state?.input || {}, null, 2)} />
                  </div>
                </div>
              </div>

              {/* Output */}
              {output && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-1 h-3 rounded-full ${isError ? 'bg-error/40' : 'bg-success/40'}`} />
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${isError ? 'text-error/80' : 'text-(--color-text-tertiary)'}`}>
                        {isError ? 'Error Response' : 'Execution Result'}
                      </span>
                    </div>
                    <CopyButton text={output} />
                  </div>
                  <pre className={`font-mono text-[11px] leading-relaxed whitespace-pre-wrap max-h-[500px] overflow-y-auto rounded-xl p-4 border shadow-inner ${
                    isError 
                      ? 'bg-error-bg/30 border-error/10 text-error/90' 
                      : 'bg-(--color-surface) border-black/[0.04] dark:border-white/[0.04] text-(--color-text-secondary)'
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

