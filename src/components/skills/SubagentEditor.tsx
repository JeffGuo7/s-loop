import { useState, useEffect, useCallback } from 'react'
import { Bot, Plus, Trash2, Save, X } from 'lucide-react'
import { fetchSubagents, saveSubagent, deleteSubagent, type SubagentInfo } from '../../utils/piClient'
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

  const resetForm = () => {
    setFormName('')
    setFormDescription('')
    setFormModel('')
    setFormTools([])
    setFormThinkingLevel('off')
    setFormMaxTurns(10)
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
          <div className="grid grid-cols-3 gap-2">
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
