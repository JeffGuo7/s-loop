import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useAgentStore, useAppStore } from '../../stores'
import { ComponentLibrary } from './ComponentLibrary'
import { AssemblyArea } from './AssemblyArea'
import { AgentSwitcher } from './AgentSwitcher'

function AddSlashCommandForm({ agentId }: { agentId: string }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [prompt, setPrompt] = useState('')
  const updateAgent = useAgentStore((s) => s.updateAgent)
  const agents = useAgentStore((s) => s.agents)
  const agent = agents.find((a) => a.id === agentId)

  const handleAdd = () => {
    if (!name.trim() || !agent) return
    updateAgent(agentId, {
      slashCommands: [
        ...agent.slashCommands,
        { name: name.trim(), description: description.trim(), prompt: prompt.trim() },
      ],
    })
    setName('')
    setDescription('')
    setPrompt('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-1 rounded-md bg-surface-secondary/40 text-[9px] text-text-quaternary hover:text-accent border border-dashed border-border-light/30 hover:border-accent/30 transition-all"
      >
        + Add Command
      </button>
    )
  }

  return (
    <div className="space-y-1.5 p-2 rounded-lg bg-surface-secondary/30 border border-border-light/20">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Command name (e.g. explain)"
        className="w-full px-2 py-1 rounded-md bg-surface-secondary/60 border border-border-light/30 text-[9px] font-medium text-text placeholder:text-text-quaternary/30 outline-none focus:border-accent/30"
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Short description"
        className="w-full px-2 py-1 rounded-md bg-surface-secondary/60 border border-border-light/30 text-[9px] font-medium text-text placeholder:text-text-quaternary/30 outline-none focus:border-accent/30"
      />
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Prompt template"
        rows={2}
        className="w-full px-2 py-1 rounded-md bg-surface-secondary/60 border border-border-light/30 text-[9px] font-medium text-text placeholder:text-text-quaternary/30 outline-none focus:border-accent/30 resize-none"
      />
      <div className="flex gap-1.5">
        <button
          onClick={handleAdd}
          disabled={!name.trim()}
          className="flex-1 py-1 rounded-md bg-accent text-[9px] font-bold text-white disabled:opacity-40"
        >
          Save
        </button>
        <button
          onClick={() => setOpen(false)}
          className="px-3 py-1 rounded-md bg-surface-secondary/40 text-[9px] text-text-tertiary hover:text-text"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export function AgentAssemblyPanel() {
  const activeAgentId = useAgentStore((s) => s.activeAgentId)
  const agents = useAgentStore((s) => s.agents)
  const updateAgent = useAgentStore((s) => s.updateAgent)
  const addSkill = useAgentStore((s) => s.addSkillToAgent)
  const removeSkill = useAgentStore((s) => s.removeSkillFromAgent)
  const addMCPTool = useAgentStore((s) => s.addMCPToolToAgent)
  const removeMCPTool = useAgentStore((s) => s.removeMCPToolFromAgent)
  const addMCPServer = useAgentStore((s) => s.addMCPServerToAgent)
  const removeMCPServer = useAgentStore((s) => s.removeMCPServerFromAgent)
  const addAccessiblePath = useAgentStore((s) => s.addAccessiblePath)
  const removeAccessiblePath = useAgentStore((s) => s.removeAccessiblePath)

  const activeProvider = useAppStore((s) => s.activeProvider)
  const providerList = useAppStore((s) => s.providerList)
  const providerConfigs = useAppStore((s) => s.providerConfigs)

  const agent = agents.find((a) => a.id === activeAgentId)

  const handleToggleSkill = (skillName: string) => {
    if (!agent) return
    if (agent.skills.includes(skillName)) {
      removeSkill(agent.id, skillName)
    } else {
      addSkill(agent.id, skillName)
    }
  }

  const handleToggleMCPTool = (serverName: string, toolName: string) => {
    if (!agent) return
    const exists = agent.mcpTools.some(
      (t) => t.serverName === serverName && t.toolName === toolName
    )
    if (exists) {
      removeMCPTool(agent.id, serverName, toolName)
    } else {
      addMCPTool(agent.id, serverName, toolName)
    }
  }

  const handleToggleMCPServer = (serverName: string) => {
    if (!agent) return
    if (agent.mcpServers.includes(serverName)) {
      removeMCPServer(agent.id, serverName)
    } else {
      addMCPServer(agent.id, serverName)
    }
  }

  // Build model options from provider list
  const providerInfo = providerList.find((p) => p.id === activeProvider)
  const modelOptions: { id: string; name: string }[] = []
  if (providerInfo?.models) {
    for (const key of Object.keys(providerInfo.models)) {
      modelOptions.push(providerInfo.models[key])
    }
  }
  // Fallback: current configured model
  const currentModel = providerConfigs[activeProvider]?.model
  if (currentModel && !modelOptions.find((m) => m.id === currentModel)) {
    modelOptions.unshift({ id: currentModel, name: currentModel })
  }

  return (
    <div className="space-y-3">
      <AgentSwitcher />
      {agent ? (
        <div className="flex flex-col gap-2.5">
          {/* Instructions */}
          <div className="rounded-xl bg-surface-secondary/20 border border-border-light/20 p-2.5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px] font-black uppercase tracking-[0.15em] text-accent/60">
                Instructions
              </span>
              <div className="flex-1 border-t border-border-light/30" />
            </div>
            <textarea
              value={agent.instructions}
              onChange={(e) => updateAgent(agent.id, { instructions: e.target.value })}
              placeholder="System prompt / instructions for this agent..."
              rows={3}
              className="w-full px-2.5 py-1.5 rounded-lg bg-surface-secondary/40 border border-border-light/30 text-[10px] font-medium text-text placeholder:text-text-quaternary/30 outline-none focus:border-accent/30 transition-all resize-none"
            />
          </div>

          {/* Model */}
          <div className="rounded-xl bg-surface-secondary/20 border border-border-light/20 p-2.5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px] font-black uppercase tracking-[0.15em] text-accent/60">
                Model
              </span>
              <div className="flex-1 border-t border-border-light/30" />
            </div>
            <select
              value={agent.model}
              onChange={(e) => updateAgent(agent.id, { model: e.target.value })}
              className="w-full px-2.5 py-1.5 rounded-lg bg-surface-secondary/40 border border-border-light/30 text-[10px] font-medium text-text outline-none focus:border-accent/30 transition-all appearance-none"
            >
              <option value="">Default (use provider model)</option>
              {modelOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Permission Mode */}
          <div className="rounded-xl bg-surface-secondary/20 border border-border-light/20 p-2.5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px] font-black uppercase tracking-[0.15em] text-accent/60">
                Permission Mode
              </span>
              <div className="flex-1 border-t border-border-light/30" />
            </div>
            <div className="flex gap-1.5">
              {(['ask', 'allow', 'deny'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => updateAgent(agent.id, { permissionMode: mode })}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                    agent.permissionMode === mode
                      ? 'bg-accent text-white shadow-sm'
                      : 'bg-surface-secondary/40 text-text-tertiary hover:text-text border border-border-light/20'
                  }`}
                >
                  {mode === 'ask' ? '🔍 Ask' : mode === 'allow' ? '✓ Allow' : '✗ Deny'}
                </button>
              ))}
            </div>
          </div>

          {/* Slash Commands */}
          <div className="rounded-xl bg-surface-secondary/20 border border-border-light/20 p-2.5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px] font-black uppercase tracking-[0.15em] text-accent/60">
                Slash Commands
              </span>
              <div className="flex-1 border-t border-border-light/30" />
            </div>
            {agent.slashCommands.length === 0 ? (
              <p className="text-[9px] text-text-quaternary/50 italic">No slash commands defined</p>
            ) : (
              <div className="space-y-1 mb-2">
                {agent.slashCommands.map((cmd, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-2 py-1 rounded-md bg-surface-secondary/40 text-[9px]">
                    <span className="font-bold text-accent font-mono">/{cmd.name}</span>
                    <span className="text-text-tertiary flex-1 truncate">{cmd.description}</span>
                    <button
                      onClick={() => updateAgent(agent.id, {
                        slashCommands: agent.slashCommands.filter((_, i) => i !== idx)
                      })}
                      className="text-text-quaternary hover:text-red-500"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <AddSlashCommandForm agentId={agent.id} />
          </div>

          {/* Accessible Paths */}
          <div className="rounded-xl bg-surface-secondary/20 border border-border-light/20 p-2.5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[9px] font-black uppercase tracking-[0.15em] text-accent/60">
                Workspace Paths
              </span>
              <div className="flex-1 border-t border-border-light/30" />
            </div>
            <div className="flex flex-wrap gap-1">
              {agent.accessiblePaths.map((p) => (
                <span key={p} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-secondary/60 text-[9px] font-mono text-text-secondary border border-border-light/20">
                  {p}
                  <button onClick={() => removeAccessiblePath(agent.id, p)} className="text-text-quaternary hover:text-red-500 ml-0.5">×</button>
                </span>
              ))}
              <button
                onClick={async () => {
                  try {
                    const { open } = await import('@tauri-apps/plugin-dialog')
                    const dir = await open({ directory: true, title: 'Select workspace path' })
                    if (dir) addAccessiblePath(agent.id, dir)
                  } catch {
                    const p = prompt('Enter workspace path:')
                    if (p) addAccessiblePath(agent.id, p)
                  }
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-surface-secondary/40 text-[9px] text-text-quaternary hover:text-accent border border-dashed border-border-light/30 hover:border-accent/30 transition-all"
              >
                + Add
              </button>
            </div>
          </div>

          {/* Components grid */}
          <div className="grid grid-cols-[1fr_1fr] gap-2.5">
            <div className="rounded-xl bg-surface-secondary/20 border border-border-light/20 p-2.5">
              <ComponentLibrary
                selectedSkills={agent.skills}
                selectedMCPTools={agent.mcpTools}
                selectedMCPServers={agent.mcpServers}
                onToggleSkill={handleToggleSkill}
                onToggleMCPTool={handleToggleMCPTool}
                onToggleMCPServer={handleToggleMCPServer}
              />
            </div>
            <div className="rounded-xl bg-surface-secondary/20 border border-border-light/20 p-2.5">
              <AssemblyArea />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <div className="w-12 h-12 rounded-full bg-surface-secondary/30 border border-border-light/20 flex items-center justify-center mb-3">
            <Plus size={20} className="text-accent/40" />
          </div>
          <p className="text-[11px] text-text-tertiary/40 font-medium max-w-[160px] leading-relaxed">
            Click + to create your first agent
          </p>
        </div>
      )}
    </div>
  )
}
