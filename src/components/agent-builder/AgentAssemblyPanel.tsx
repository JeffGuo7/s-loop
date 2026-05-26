import { Plus } from 'lucide-react'
import { useAgentStore } from '../../stores'
import { ComponentLibrary } from './ComponentLibrary'
import { AssemblyArea } from './AssemblyArea'
import { AgentSwitcher } from './AgentSwitcher'

export function AgentAssemblyPanel() {
  const activeAgentId = useAgentStore((s) => s.activeAgentId)
  const agents = useAgentStore((s) => s.agents)
  const addSkill = useAgentStore((s) => s.addSkillToAgent)
  const removeSkill = useAgentStore((s) => s.removeSkillFromAgent)
  const addMCPTool = useAgentStore((s) => s.addMCPToolToAgent)
  const removeMCPTool = useAgentStore((s) => s.removeMCPToolFromAgent)

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

  return (
    <div className="space-y-3">
      <AgentSwitcher />
      {agent ? (
        <div className="grid grid-cols-[1fr_1fr] gap-2.5">
          <div className="rounded-xl bg-surface-secondary/20 border border-border-light/20 p-2.5">
            <ComponentLibrary
              selectedSkills={agent.skills}
              selectedMCPTools={agent.mcpTools}
              onToggleSkill={handleToggleSkill}
              onToggleMCPTool={handleToggleMCPTool}
            />
          </div>
          <div className="rounded-xl bg-surface-secondary/20 border border-border-light/20 p-2.5">
            <AssemblyArea />
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
