export interface AgentMCPTool {
  serverName: string
  toolName: string
}

export interface Agent {
  id: string
  name: string
  description: string
  avatar: string
  skills: string[]
  mcpTools: AgentMCPTool[]
  createdAt: number
  updatedAt: number
}

export interface AgentStore {
  agents: Agent[]
  activeAgentId: string | null

  createAgent: (name: string, description: string) => Agent
  updateAgent: (id: string, updates: Partial<Agent>) => void
  deleteAgent: (id: string) => void
  setActiveAgent: (id: string) => void
  duplicateAgent: (id: string) => Agent

  addSkillToAgent: (agentId: string, skillName: string) => void
  removeSkillFromAgent: (agentId: string, skillName: string) => void
  addMCPToolToAgent: (agentId: string, serverName: string, toolName: string) => void
  removeMCPToolFromAgent: (agentId: string, serverName: string, toolName: string) => void
}
