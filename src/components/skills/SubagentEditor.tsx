import { useState, useEffect, useCallback } from 'react'
import { Bot, Plus, Trash2, Save, X, RefreshCw, Square } from 'lucide-react'
import {
  cancelSubagentRun,
  deleteSubagent,
  fetchSubagentRuns,
  fetchSubagents,
  saveSubagent,
  type SubagentInfo,
  type SubagentRunInfo,
} from '../../utils/piClient'
import { Card } from '../ui'

const BUILTIN_TOOLS = [
  'read', 'write', 'edit', 'grep', 'find', 'ls',
  'bash', 'web_search', 'web_fetch', 'get_current_time',
]

const MODELS = [
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
  { id: 'claude-opus-4-8', name: 'Claude Opus 4.8' },
  { id: 'gpt-4o', name: 'GPT-4o' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
]

interface SubagentEditorProps {
  projectDir?: string
}

export function SubagentEditor({ projectDir }: SubagentEditorProps) {
  const [agents, setAgents] = useState<SubagentInfo[]>([])
  const [runs, setRuns] = useState<SubagentRunInfo[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Form state
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formModel, setFormModel] = useState('')
  const [formTools, setFormTools] = useState<string[]>([])
  const [formThinkingLevel, setFormThinkingLevel] = useState('off')
  const [formMaxTurns, setFormMaxTurns] = useState(10)
  const [formMaxTokens, setFormMaxTokens] = useState(50_000)
  const [formPermissionMode, setFormPermissionMode] = useState('allow')
  const [formSystemPrompt, setFormSystemPrompt] = useState('')
  const [formSource, setFormSource] = useState<'builtin' | 'user'>('user')

  const loadAgents = useCallback(async () => {
    const list = await fetchSubagents(projectDir)
    setAgents(list)
  }, [projectDir])

  useEffect(() => {
    loadAgents()
  }, [loadAgents])

  const loadRuns = useCallback(async () => {
    setRuns(await fetchSubagentRuns(12))
  }, [])

  useEffect(() => {
    void loadRuns()
    const interval = window.setInterval(() => void loadRuns(), 3000)
    return () => window.clearInterval(interval)
  }, [loadRuns])

  const resetForm = () => {
    setFormName('')
    setFormDescription('')
    setFormModel('')
    setFormTools([])
    setFormThinkingLevel('off')
    setFormMaxTurns(10)
    setFormMaxTokens(50_000)
    setFormPermissionMode('allow')
    setFormSystemPrompt('')
    setFormSource('user')
    setEditing(false)
  }

  const startNew = () => {
    resetForm()
    setSelected(null)
    setEditing(true)
  }

  const toggleTool = (tool: string) => {
    setFormTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool],
    )
  }

  const handleSave = async () => {
    if (!formName.trim()) return
    setSaving(true)
    try {
      const result = await saveSubagent(formName.trim(), {
        description: formDescription.trim(),
        model: formModel || undefined,
        tools: formTools,
        thinkingLevel: formThinkingLevel,
        maxTurns: formMaxTurns,
        maxTokens: formMaxTokens,
        permissionMode: formPermissionMode,
        systemPrompt: formSystemPrompt.trim(),
        projectDir,
      })
      if (result.ok) {
        await loadAgents()
        resetForm()
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete sub-agent "${name}"?`)) return
    setDeleting(true)
    try {
      await deleteSubagent(name, projectDir)
      await loadAgents()
      if (selected === name) {
        setSelected(null)
        resetForm()
      }
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Bot size={14} className="text-accent" />
          <span className="text-xs font-bold text-text-secondary tracking-tight">Sub-agents</span>
          <span className="text-[9px] text-text-quaternary">({agents.length})</span>
        </div>
        <button
          onClick={startNew}
          className="p-1 rounded-md hover:bg-accent/10 text-text-tertiary hover:text-accent transition-colors"
          title="New sub-agent"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Recent run control plane */}
      <div className="rounded-xl border border-border-light bg-surface-secondary/25 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[9px] font-black uppercase tracking-wider text-text-tertiary">Recent runs</span>
          <button type="button" onClick={() => void loadRuns()} className="rounded-md p-1 text-text-quaternary hover:bg-surface-secondary hover:text-accent" title="Refresh runs">
            <RefreshCw size={10} />
          </button>
        </div>
        {runs.length === 0 ? (
          <p className="py-3 text-center text-[9px] text-text-quaternary">No sub-agent runs yet.</p>
        ) : (
          <div className="mt-1.5 space-y-1">
            {runs.slice(0, 6).map((run) => {
              const tokens = run.usage.input + run.usage.output
              const active = run.status === 'running' || run.status === 'cancelling'
              return (
                <div key={run.runId} className="flex items-start gap-2 rounded-lg bg-surface px-2 py-1.5">
                  <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${active ? 'bg-accent animate-pulse' : run.status === 'completed' ? 'bg-green-500' : 'bg-red-500'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[10px] font-bold text-text-secondary">{run.agent}</span>
                      <span className="text-[8px] uppercase text-text-quaternary">{run.status}</span>
                    </div>
                    <p className="truncate text-[9px] text-text-quaternary">{run.task}</p>
                    <p className="mt-0.5 text-[8px] font-mono text-text-quaternary">
                      {run.usage.turns}/{run.budget.maxTurns} turns · {tokens.toLocaleString()}/{run.budget.maxTokens.toLocaleString()} tokens
                      {run.durationMs !== undefined && ` · ${(run.durationMs / 1000).toFixed(1)}s`}
                    </p>
                    {run.errorMessage && <p className="mt-0.5 truncate text-[8px] text-red-500">{run.stopReason}: {run.errorMessage}</p>}
                  </div>
                  {active && (
                    <button
                      type="button"
                      onClick={async () => { await cancelSubagentRun(run.runId); await loadRuns() }}
                      className="rounded-md p-1 text-red-500 hover:bg-red-500/10"
                      title="Cancel run"
                    >
                      <Square size={9} fill="currentColor" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Agent list */}
      <div className="space-y-1">
        {agents.map((agent) => (
          <button
            key={agent.name}
            onClick={() => selected === agent.name && !editing ? setSelected(null) : (setSelected(agent.name), setEditing(false))}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors ${
              selected === agent.name
                ? 'bg-accent/10 text-accent'
                : 'hover:bg-surface-secondary/60 text-text-secondary'
            }`}
          >
            <div className={`w-5 h-5 rounded-md flex items-center justify-center ${
              agent.source === 'builtin' ? 'bg-blue-500/10' : 'bg-green-500/10'
            }`}>
              <Bot size={10} className={agent.source === 'builtin' ? 'text-blue-500' : 'text-green-500'} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-bold truncate">{agent.name}</div>
              <div className="text-[9px] text-text-tertiary truncate">{agent.description}</div>
            </div>
            <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
              agent.source === 'builtin' ? 'bg-blue-500/10 text-blue-500' : 'bg-green-500/10 text-green-500'
            }`}>
              {agent.source}
            </span>
          </button>
        ))}
      </div>

      {/* Editor */}
      {editing && (
        <Card className="p-3 space-y-3 border-accent/20">
          {/* Name */}
          <div>
            <label className="text-[9px] font-bold uppercase tracking-wider text-text-tertiary">Name</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              disabled={formSource === 'builtin'}
              placeholder="my-agent"
              className="w-full mt-0.5 px-2 py-1 text-xs rounded-md bg-surface border border-black/[0.06] dark:border-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent text-text"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-[9px] font-bold uppercase tracking-wider text-text-tertiary">Description</label>
            <input
              type="text"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="What this agent does"
              className="w-full mt-0.5 px-2 py-1 text-xs rounded-md bg-surface border border-black/[0.06] dark:border-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent text-text"
            />
          </div>

          {/* Model */}
          <div>
            <label className="text-[9px] font-bold uppercase tracking-wider text-text-tertiary">Model</label>
            <select
              value={formModel}
              onChange={(e) => setFormModel(e.target.value)}
              className="w-full mt-0.5 px-2 py-1 text-xs rounded-md bg-surface border border-black/[0.06] dark:border-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent text-text"
            >
              <option value="">Inherit from parent</option>
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Tools */}
          <div>
            <label className="text-[9px] font-bold uppercase tracking-wider text-text-tertiary mb-1 block">
              Tools ({formTools.length} selected)
            </label>
            <div className="flex flex-wrap gap-1">
              {BUILTIN_TOOLS.map((tool) => (
                <button
                  key={tool}
                  onClick={() => toggleTool(tool)}
                  className={`text-[9px] font-medium px-2 py-0.5 rounded-full transition-colors ${
                    formTools.includes(tool)
                      ? 'bg-accent/15 text-accent border border-accent/20'
                      : 'bg-surface-secondary/50 text-text-tertiary border border-transparent hover:border-accent/10'
                  }`}
                >
                  {tool}
                </button>
              ))}
            </div>
          </div>

          {/* Settings row */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] font-bold uppercase tracking-wider text-text-tertiary">Thinking</label>
              <select
                value={formThinkingLevel}
                onChange={(e) => setFormThinkingLevel(e.target.value)}
                className="w-full mt-0.5 px-2 py-1 text-xs rounded-md bg-surface border border-black/[0.06] dark:border-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent text-text"
              >
                <option value="off">Off</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="text-[9px] font-bold uppercase tracking-wider text-text-tertiary">Max Turns</label>
              <input
                type="number"
                value={formMaxTurns}
                onChange={(e) => setFormMaxTurns(parseInt(e.target.value, 10) || 10)}
                min={1}
                max={50}
                className="w-full mt-0.5 px-2 py-1 text-xs rounded-md bg-surface border border-black/[0.06] dark:border-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent text-text"
              />
            </div>
            <div>
              <label className="text-[9px] font-bold uppercase tracking-wider text-text-tertiary">Token Budget</label>
              <input
                type="number"
                value={formMaxTokens}
                onChange={(e) => setFormMaxTokens(parseInt(e.target.value, 10) || 50_000)}
                min={1000}
                max={100000}
                step={1000}
                className="w-full mt-0.5 px-2 py-1 text-xs rounded-md bg-surface border border-black/[0.06] dark:border-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent text-text"
              />
            </div>
            <div>
              <label className="text-[9px] font-bold uppercase tracking-wider text-text-tertiary">Permissions</label>
              <select
                value={formPermissionMode}
                onChange={(e) => setFormPermissionMode(e.target.value)}
                className="w-full mt-0.5 px-2 py-1 text-xs rounded-md bg-surface border border-black/[0.06] dark:border-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent text-text"
              >
                <option value="allow">Allow</option>
                <option value="ask">Ask</option>
                <option value="deny">Deny</option>
              </select>
            </div>
          </div>

          {/* System prompt */}
          <div>
            <label className="text-[9px] font-bold uppercase tracking-wider text-text-tertiary">System Prompt</label>
            <textarea
              value={formSystemPrompt}
              onChange={(e) => setFormSystemPrompt(e.target.value)}
              placeholder="# My Agent\n\nYou are a..."
              rows={8}
              className="w-full mt-0.5 px-2 py-1.5 text-xs rounded-md bg-surface border border-black/[0.06] dark:border-white/[0.06] focus:outline-none focus:ring-1 focus:ring-accent text-text font-mono resize-y"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1">
              <button
                onClick={handleSave}
                disabled={!formName.trim() || saving}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-accent text-white text-[11px] font-bold hover:bg-accent/90 transition-colors disabled:opacity-40"
              >
                <Save size={11} />
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={resetForm}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-surface-secondary/50 text-text-secondary text-[11px] font-bold hover:bg-surface-secondary transition-colors"
              >
                <X size={11} />
                Cancel
              </button>
            </div>
            {formSource === 'user' && selected && (
              <button
                onClick={() => handleDelete(selected)}
                disabled={deleting}
                className="flex items-center gap-1 px-2 py-1.5 rounded-md text-red-500 text-[10px] font-bold hover:bg-red-500/10 transition-colors"
              >
                <Trash2 size={10} />
                Delete
              </button>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
