import type {
  Agent,
  WorkspaceAccess,
  WorkspaceRoot,
  WorkspaceRootSource,
} from '../types/agent'

type LegacyAgent = Partial<Agent> & {
  accessiblePaths?: unknown
  workspaceRoots?: unknown
}

function stablePathId(path: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < path.length; index += 1) {
    hash ^= path.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `root_${(hash >>> 0).toString(36)}`
}

function isWorkspaceAccess(value: unknown): value is WorkspaceAccess {
  return value === 'read' || value === 'read-write'
}

function isWorkspaceRootSource(value: unknown): value is WorkspaceRootSource {
  return value === 'workspace' || value === 'user-grant' || value === 'task'
}

export function createWorkspaceRoot(
  path: string,
  access: WorkspaceAccess = 'read',
  source: WorkspaceRootSource = 'user-grant',
): WorkspaceRoot {
  const normalizedPath = path.trim()
  return {
    id: stablePathId(normalizedPath),
    path: normalizedPath,
    access,
    primary: false,
    source,
  }
}

export function migrateAgentWorkspaceRoots(agent: LegacyAgent): Agent {
  const roots: WorkspaceRoot[] = []
  const seenPaths = new Set<string>()

  if (Array.isArray(agent.workspaceRoots)) {
    for (const value of agent.workspaceRoots) {
      if (!value || typeof value !== 'object') continue
      const raw = value as Partial<WorkspaceRoot>
      if (typeof raw.path !== 'string' || !raw.path.trim()) continue
      const root = createWorkspaceRoot(
        raw.path,
        isWorkspaceAccess(raw.access) ? raw.access : 'read',
        isWorkspaceRootSource(raw.source) ? raw.source : 'user-grant',
      )
      root.id = typeof raw.id === 'string' && raw.id ? raw.id : root.id
      root.primary = raw.primary === true
      if (!seenPaths.has(root.path)) {
        roots.push(root)
        seenPaths.add(root.path)
      }
    }
  }

  // Version 0 stored paths as strings and granted read/write access implicitly.
  // Preserve that capability during migration instead of silently breaking users.
  if (Array.isArray(agent.accessiblePaths)) {
    for (const value of agent.accessiblePaths) {
      if (typeof value !== 'string' || !value.trim()) continue
      const root = createWorkspaceRoot(value, 'read-write', 'user-grant')
      if (seenPaths.has(root.path)) {
        const existing = roots.find((candidate) => candidate.path === root.path)
        if (existing) existing.access = 'read-write'
      } else {
        roots.push(root)
        seenPaths.add(root.path)
      }
    }
  }

  const migrated = { ...agent, workspaceRoots: roots } as LegacyAgent
  delete migrated.accessiblePaths
  return migrated as Agent
}

export function migrateAgentStoreState(persisted: unknown): unknown {
  if (!persisted || typeof persisted !== 'object') return persisted
  const state = persisted as { agents?: unknown }
  if (!Array.isArray(state.agents)) return persisted
  return {
    ...state,
    agents: state.agents.map((agent) =>
      agent && typeof agent === 'object'
        ? migrateAgentWorkspaceRoots(agent as LegacyAgent)
        : agent,
    ),
  }
}
