import { useAgentStore } from '../../stores'
import { AssemblyItem } from './AssemblyItem'

export function AssemblyArea() {
  const agents = useAgentStore((s) => s.agents)
  const activeAgentId = useAgentStore((s) => s.activeAgentId)
  const removeSkill = useAgentStore((s) => s.removeSkillFromAgent)
  const removeMCPTool = useAgentStore((s) => s.removeMCPToolFromAgent)

  const agent = agents.find((a) => a.id === activeAgentId)

  if (!agent) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="w-10 h-10 rounded-full bg-surface-secondary/40 border border-border-light flex items-center justify-center mb-3">
          <span className="text-lg">🧠</span>
        </div>
        <p className="text-[11px] text-text-tertiary/50 font-medium max-w-[140px]">
            Create an agent to get started
          </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Skills */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[9px] font-black uppercase tracking-[0.15em] text-accent/50">
            Skills
          </span>
          <span className="text-[9px] text-text-quaternary/40 font-mono">
            {agent.skills.length}
          </span>
          <div className="flex-1 border-t border-border-light/20" />
        </div>
        <div className="space-y-1.5">
          {agent.skills.length > 0 ? (
            agent.skills.map((skillName) => (
              <AssemblyItem
                key={skillName}
                type="skill"
                label={skillName}
                onRemove={() => removeSkill(agent.id, skillName)}
              />
            ))
          ) : (
            <p className="text-[10px] text-text-tertiary/30 text-center py-3">
              No skills added
            </p>
          )}
        </div>
      </div>

      {/* MCP Tools */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[9px] font-black uppercase tracking-[0.15em] text-accent/50">
            MCP Tools
          </span>
          <span className="text-[9px] text-text-quaternary/40 font-mono">
            {agent.mcpTools.length}
          </span>
          <div className="flex-1 border-t border-border-light/20" />
        </div>
        <div className="space-y-1.5">
          {agent.mcpTools.length > 0 ? (
            agent.mcpTools.map((tool) => (
              <AssemblyItem
                key={`${tool.serverName}/${tool.toolName}`}
                type="mcp-tool"
                label={tool.toolName}
                subtitle={tool.serverName}
                onRemove={() => removeMCPTool(agent.id, tool.serverName, tool.toolName)}
              />
            ))
          ) : (
            <p className="text-[10px] text-text-tertiary/30 text-center py-3">
              No MCP tools added
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
