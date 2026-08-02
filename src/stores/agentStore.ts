import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Agent, AgentStore } from '../types/agent'
import {
  createWorkspaceRoot,
  migrateAgentStoreState,
  migrateAgentWorkspaceRoots,
} from '../utils/workspaceRoots'
import {
  createAgentProfile,
  migrateAgentProfile,
  migrateAgentProfileState,
} from '../utils/agentPrompt'

function generateId(): string {
  return `agent_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
}

const DEFAULT_AVATARS = ['🤖', '🧠', '⚡', '🦾', '🎯', '🔮', '💡', '🚀']

function pickAvatar(): string {
  return DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)]
}

const DEFAULT_AGENT_ID = 'agent_default'

function createDefaultAgent(): Agent {
  return {
    id: DEFAULT_AGENT_ID,
    name: 'S-Loop',
    description: '通用助手，理解上下文、调度技能、编排工具。',
    avatar: '🤖',
    instructions: 'You are a helpful assistant. Use available tools when needed.',
    ...createAgentProfile('S-Loop', '通用助手，理解上下文、调度技能、编排工具。'),
    rules: 'Use available tools when needed. Ask before destructive actions.',
    model: '',
    skills: [],
    mcpTools: [],
    mcpServers: [],
    workspaceRoots: [],
    permissionMode: 'ask',
    permissionRules: {},
    slashCommands: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

const initialDefaultAgent = createDefaultAgent()

export const useAgentStore = create<AgentStore>()(
  persist(
    (set, get) => ({
      agents: [initialDefaultAgent],
      activeAgentId: initialDefaultAgent.id,
      userProfile: '',

      createAgent: (name, description) => {
        const agent: Agent = {
          id: generateId(),
          name,
          description: description || '',
          avatar: pickAvatar(),
          instructions: '',
          ...createAgentProfile(name, description),
          model: '',
          skills: [],
          mcpTools: [],
          mcpServers: [],
          workspaceRoots: [],
          permissionMode: 'ask',
          permissionRules: {},
          slashCommands: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        set((state) => ({
          agents: [...state.agents, agent],
          activeAgentId: agent.id,
        }))
        return agent
      },

      updateAgent: (id, updates) => {
        set((state) => ({
          agents: state.agents.map((a) =>
            a.id === id ? { ...a, ...updates, updatedAt: Date.now() } : a
          ),
        }))
      },

      deleteAgent: (id) => {
        if (id === DEFAULT_AGENT_ID) return
        set((state) => {
          const remaining = state.agents.filter((a) => a.id !== id)
          return {
            agents: remaining,
            activeAgentId:
              state.activeAgentId === id
                ? remaining[0]?.id ?? null
                : state.activeAgentId,
          }
        })
      },

      setActiveAgent: (id) => {
        set({ activeAgentId: id })
      },

      duplicateAgent: (id) => {
        const source = get().agents.find((a) => a.id === id)
        if (!source) throw new Error('Agent not found')
        const clone: Agent = {
          ...source,
          id: generateId(),
          name: `${source.name} (copy)`,
          workspaceRoots: source.workspaceRoots.map((root) => ({ ...root })),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        set((state) => ({
          agents: [...state.agents, clone],
          activeAgentId: clone.id,
        }))
        return clone
      },

      updateUserProfile: (userProfile) => set({ userProfile }),

      addSkillToAgent: (agentId, skillName) => {
        set((state) => ({
          agents: state.agents.map((a) => {
            if (a.id !== agentId) return a
            if (a.skills.includes(skillName)) return a
            return { ...a, skills: [...a.skills, skillName], updatedAt: Date.now() }
          }),
        }))
      },

      removeSkillFromAgent: (agentId, skillName) => {
        set((state) => ({
          agents: state.agents.map((a) =>
            a.id === agentId
              ? {
                  ...a,
                  skills: a.skills.filter((s) => s !== skillName),
                  updatedAt: Date.now(),
                }
              : a
          ),
        }))
      },

      addMCPServerToAgent: (agentId, serverName) => {
        set((state) => ({
          agents: state.agents.map((a) =>
            a.id === agentId
              ? { ...a, mcpServers: a.mcpServers.includes(serverName) ? a.mcpServers : [...a.mcpServers, serverName], updatedAt: Date.now() }
              : a
          ),
        }))
      },

      removeMCPServerFromAgent: (agentId, serverName) => {
        set((state) => ({
          agents: state.agents.map((a) =>
            a.id === agentId
              ? { ...a, mcpServers: a.mcpServers.filter((s) => s !== serverName), updatedAt: Date.now() }
              : a
          ),
        }))
      },

      addMCPToolToAgent: (agentId, serverName, toolName) => {
        set((state) => ({
          agents: state.agents.map((a) => {
            if (a.id !== agentId) return a
            const exists = a.mcpTools.some(
              (t) => t.serverName === serverName && t.toolName === toolName
            )
            if (exists) return a
            return {
              ...a,
              mcpTools: [...a.mcpTools, { serverName, toolName }],
              updatedAt: Date.now(),
            }
          }),
        }))
      },

      removeMCPToolFromAgent: (agentId, serverName, toolName) => {
        set((state) => ({
          agents: state.agents.map((a) =>
            a.id === agentId
              ? {
                  ...a,
                  mcpTools: a.mcpTools.filter(
                    (t) => !(t.serverName === serverName && t.toolName === toolName)
                  ),
                  updatedAt: Date.now(),
                }
              : a
          ),
        }))
      },

      addWorkspaceRoot: (agentId, path, access = 'read', source = 'user-grant') => {
        const root = createWorkspaceRoot(path, access, source)
        if (!root.path) return
        set((state) => ({
          agents: state.agents.map((a) => {
            if (a.id !== agentId) return a
            const existing = a.workspaceRoots.find((candidate) => candidate.path === root.path)
            const workspaceRoots = existing
              ? a.workspaceRoots.map((candidate) =>
                  candidate.id === existing.id
                    ? { ...candidate, access, source }
                    : candidate
                )
              : [...a.workspaceRoots, root]
            return { ...a, workspaceRoots, updatedAt: Date.now() }
          }),
        }))
      },

      updateWorkspaceRootAccess: (agentId, rootId, access) => {
        set((state) => ({
          agents: state.agents.map((a) =>
            a.id === agentId
              ? {
                  ...a,
                  workspaceRoots: a.workspaceRoots.map((root) =>
                    root.id === rootId ? { ...root, access } : root
                  ),
                  updatedAt: Date.now(),
                }
              : a
          ),
        }))
      },

      removeWorkspaceRoot: (agentId, rootId) => {
        set((state) => ({
          agents: state.agents.map((a) =>
            a.id === agentId
              ? {
                  ...a,
                  workspaceRoots: a.workspaceRoots.filter((root) => root.id !== rootId),
                  updatedAt: Date.now(),
                }
              : a
          ),
        }))
      },
    }),
    {
      name: 'snotra-agents',
      version: 2,
      migrate: (persisted) =>
        migrateAgentProfileState(migrateAgentStoreState(persisted)),
      partialize: (state) => ({
        agents: state.agents,
        activeAgentId: state.activeAgentId,
        userProfile: state.userProfile,
      }),
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<AgentStore>) }
        merged.agents = merged.agents?.map((agent) =>
          migrateAgentProfile(
            migrateAgentWorkspaceRoots(agent) as unknown as Record<string, unknown>,
          ) as unknown as Agent,
        )
        // Guarantee the default agent always exists and stays first
        const hasDefault = merged.agents?.some((a) => a.id === DEFAULT_AGENT_ID)
        if (!merged.agents || merged.agents.length === 0) {
          merged.agents = [createDefaultAgent()]
          merged.activeAgentId = DEFAULT_AGENT_ID
        } else if (!hasDefault) {
          merged.agents = [createDefaultAgent(), ...merged.agents]
        }
        if (!merged.activeAgentId) {
          merged.activeAgentId = merged.agents[0].id
        }
        return merged
      },
    }
  )
)
