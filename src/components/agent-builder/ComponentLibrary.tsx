import { useState } from 'react'
import { Search } from 'lucide-react'
import { useMCPStore } from '../../stores'
import { useSkillStore } from '../../stores'
import { SkillChip, MCPToolChip } from './parts'

interface ComponentLibraryProps {
  selectedSkills: string[]
  selectedMCPTools: Array<{ serverName: string; toolName: string }>
  onToggleSkill: (name: string) => void
  onToggleMCPTool: (serverName: string, toolName: string) => void
}

export function ComponentLibrary({
  selectedSkills,
  selectedMCPTools,
  onToggleSkill,
  onToggleMCPTool,
}: ComponentLibraryProps) {
  const [skillSearch, setSkillSearch] = useState('')
  const [mcpSearch, setMcpSearch] = useState('')

  const mcpServers = useMCPStore((s) => s.servers)
  const mcpStatuses = useMCPStore((s) => s.serverStatuses)
  const skills = useSkillStore((s) => s.skills)

  const filteredSkills = skills.filter((s) =>
    s.name.toLowerCase().includes(skillSearch.toLowerCase())
  )

  const filteredMCPServers = mcpServers.filter((server) =>
    server.name.toLowerCase().includes(mcpSearch.toLowerCase())
  )

  const isToolSelected = (serverName: string, toolName: string) =>
    selectedMCPTools.some((t) => t.serverName === serverName && t.toolName === toolName)

  // Collect all available tools from server statuses
  const allTools = filteredMCPServers.flatMap((server) => {
    const status = mcpStatuses[server.name]
    if (status && status.tools.length > 0) {
      return status.tools.map((tool) => ({
        serverName: server.name,
        toolName: tool.name,
      }))
    }
    // Fallback: show server-level items when no tools discovered
    return [{ serverName: server.name, toolName: server.name }]
  })

  const hasTools = allTools.length > 0

  return (
    <div className="flex flex-col gap-4">
      {/* ── MCP Tools Section ── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[9px] font-black uppercase tracking-[0.15em] text-accent/60">
            MCP Tools
          </span>
          <div className="flex-1 border-t border-border-light/30" />
        </div>

        <div className="relative mb-2">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-quaternary/50" />
          <input
            value={mcpSearch}
            onChange={(e) => setMcpSearch(e.target.value)}
            placeholder="Search MCP..."
            className="w-full pl-7 pr-3 py-1.5 rounded-lg bg-surface-secondary/40 border border-border-light/30 text-[10px] font-medium text-text placeholder:text-text-quaternary/30 outline-none focus:border-accent/30 transition-all"
          />
        </div>

        <div className="space-y-0.5 max-h-[180px] overflow-y-auto custom-scrollbar">
          {hasTools ? (
            allTools.map((tool) => (
              <MCPToolChip
                key={`${tool.serverName}/${tool.toolName}`}
                serverName={tool.serverName}
                toolName={tool.toolName}
                selected={isToolSelected(tool.serverName, tool.toolName)}
                onClick={() => onToggleMCPTool(tool.serverName, tool.toolName)}
              />
            ))
          ) : (
            filteredMCPServers.map((server) => (
              <MCPToolChip
                key={server.name}
                serverName={server.name}
                toolName={server.name}
                selected={isToolSelected(server.name, server.name)}
                onClick={() => onToggleMCPTool(server.name, server.name)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Skills Section ── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[9px] font-black uppercase tracking-[0.15em] text-accent/60">
            Skills
          </span>
          <div className="flex-1 border-t border-border-light/30" />
        </div>

        <div className="relative mb-2">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-quaternary/50" />
          <input
            value={skillSearch}
            onChange={(e) => setSkillSearch(e.target.value)}
            placeholder="Search skills..."
            className="w-full pl-7 pr-3 py-1.5 rounded-lg bg-surface-secondary/40 border border-border-light/30 text-[10px] font-medium text-text placeholder:text-text-quaternary/30 outline-none focus:border-accent/30 transition-all"
          />
        </div>

        <div className="space-y-0.5 max-h-[180px] overflow-y-auto custom-scrollbar">
          {filteredSkills.length > 0 ? (
            filteredSkills.map((skill) => (
              <SkillChip
                key={skill.name}
                skillName={skill.name}
                selected={selectedSkills.includes(skill.name)}
                onClick={() => onToggleSkill(skill.name)}
              />
            ))
          ) : (
            <p className="text-[10px] text-text-tertiary/40 text-center py-3 font-medium">
              No skills available
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
