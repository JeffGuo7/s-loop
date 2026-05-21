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
    <div className="my-8 animate-fade-in">
      <Card
        className={`overflow-hidden transition-all duration-700 border border-black/[0.04] dark:border-white/[0.04] rounded-[40px] ${
          expanded ? 'ring-2 ring-accent/20 shadow-2xl' : 'hover:border-accent/30 hover:shadow-xl'
        }`}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-8 px-8 py-6 hover:bg-surface-secondary/60 transition-all text-left group/toolbtn"
        >
          <div className={`p-4 rounded-[20px] transition-all duration-500 ${
            isRunning 
              ? 'bg-accent text-white shadow-xl shadow-accent/30 animate-pulse' 
              : expanded 
                ? 'bg-accent text-white shadow-lg shadow-accent/20' 
                : 'bg-surface-secondary text-text-tertiary group-hover/toolbtn:bg-surface-tertiary group-hover/toolbtn:text-text'
          }`}>
            {isRunning ? <Activity size={22} strokeWidth={3} className="animate-spin-slow" /> : <Icon size={22} strokeWidth={3} />}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-4">
              <span className={`text-[12px] font-bold uppercase tracking-[0.3em] opacity-50 ${isRunning ? 'text-accent' : 'text-text-tertiary'}`}>
                {isRunning ? 'Executing' : isError ? 'Execution Failed' : 'Tool Call'}
              </span>
              <span className="text-[18px] font-bold text-text tracking-tight group-hover/toolbtn:text-accent transition-colors">
                {toolName.replace(/_/g, ' ')}
              </span>
            </div>
            {subtitle && (
              <div className="text-[14px] text-text-tertiary truncate mt-2 font-mono opacity-50 group-hover/toolbtn:opacity-80 transition-opacity" style={{ maxWidth: 'calc(100% - 32px)' }}>
                {subtitle}
              </div>
            )}
          </div>

          <div className={`transition-all duration-500 rounded-full p-3 ${expanded ? 'rotate-180 bg-accent-subtle text-accent shadow-sm' : 'text-text-quaternary group-hover/toolbtn:text-text-secondary group-hover/toolbtn:bg-surface-tertiary'}`}>
            <ChevronDown size={24} strokeWidth={3} />
          </div>
        </button>

        {expanded && (
          <div className="border-t border-black/[0.04] dark:border-white/[0.04] bg-surface-secondary/40 animate-fade-in">
            <div className="p-10 space-y-10">
              {/* Input Args */}
              <div className="space-y-6">
                <div className="flex items-center gap-4 ml-2">
                  <div className="w-2 h-5 rounded-full bg-accent/30" />
                  <span className="text-[12px] font-bold uppercase tracking-[0.5em] text-text-tertiary">Input Parameters</span>
                </div>
                <div className="relative group/input">
                  <pre className="font-mono text-[14px] leading-relaxed bg-surface border border-black/[0.04] dark:border-white/[0.04] rounded-[24px] p-8 overflow-x-auto text-text-secondary shadow-inner scrollbar-subtle">
                    {JSON.stringify(state?.input || {}, null, 2)}
                  </pre>
                  <div className="absolute top-6 right-6 opacity-0 group-hover/input:opacity-100 transition-opacity">
                    <CopyButton text={JSON.stringify(state?.input || {}, null, 2)} />
                  </div>
                </div>
              </div>

              {/* Output */}
              {output && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-4">
                      <div className={`w-2 h-5 rounded-full ${isError ? 'bg-red-500/40' : 'bg-green-500/40'}`} />
                      <span className={`text-[12px] font-bold uppercase tracking-[0.5em] ${isError ? 'text-red-500/80' : 'text-text-tertiary'}`}>
                        {isError ? 'Error Response' : 'Execution Result'}
                      </span>
                    </div>
                    <CopyButton text={output} />
                  </div>
                  <pre className={`font-mono text-[14px] leading-relaxed whitespace-pre-wrap max-h-[700px] overflow-y-auto rounded-[24px] p-8 border shadow-inner ${
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

