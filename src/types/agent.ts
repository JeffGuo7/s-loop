export interface AgentMCPTool {
  serverName: string
  toolName: string
}

export type PermissionAction = 'ask' | 'allow' | 'deny'

export interface PermissionRule {
  read?: PermissionAction
  edit?: PermissionAction
  bash?: PermissionAction
  glob?: PermissionAction
  grep?: PermissionAction
  list?: PermissionAction
  webfetch?: PermissionAction
  websearch?: PermissionAction
  skill?: PermissionAction
  mcp?: PermissionAction
  [key: string]: PermissionAction | undefined
}

export interface SlashCommand {
  name: string
  description: string
  prompt: string
}

export type WorkspaceAccess = 'read' | 'read-write'
export type WorkspaceRootSource = 'workspace' | 'user-grant' | 'task'
export type AgentConversationMode = 'work' | 'natural' | 'companion'

export interface WorkspaceRoot {
  id: string
  path: string
  access: WorkspaceAccess
  primary: boolean
  source: WorkspaceRootSource
}

export interface Agent {
  id: string
  name: string
  description: string
  avatar: string
  instructions: string
  identity: string
  soul: string
  rules: string
  memory: string
  conversationMode: AgentConversationMode
  model: string
  skills: string[]
  mcpTools: AgentMCPTool[]
  mcpServers: string[]
  workspaceRoots: WorkspaceRoot[]
  permissionMode: PermissionAction
  permissionRules: PermissionRule
  slashCommands: SlashCommand[]
  createdAt: number
  updatedAt: number
}

export interface AgentStore {
  agents: Agent[]
  activeAgentId: string | null
  userProfile: string

  createAgent: (name: string, description: string) => Agent
  updateAgent: (id: string, updates: Partial<Agent>) => void
  deleteAgent: (id: string) => void
  setActiveAgent: (id: string) => void
  duplicateAgent: (id: string) => Agent
  updateUserProfile: (profile: string) => void

  addSkillToAgent: (agentId: string, skillName: string) => void
  removeSkillFromAgent: (agentId: string, skillName: string) => void
  addMCPToolToAgent: (agentId: string, serverName: string, toolName: string) => void
  removeMCPToolFromAgent: (agentId: string, serverName: string, toolName: string) => void
  addMCPServerToAgent: (agentId: string, serverName: string) => void
  removeMCPServerFromAgent: (agentId: string, serverName: string) => void

  addWorkspaceRoot: (
    agentId: string,
    path: string,
    access?: WorkspaceAccess,
    source?: WorkspaceRootSource,
  ) => void
  updateWorkspaceRootAccess: (
    agentId: string,
    rootId: string,
    access: WorkspaceAccess,
  ) => void
  removeWorkspaceRoot: (agentId: string, rootId: string) => void
}
