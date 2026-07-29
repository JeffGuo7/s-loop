const MODE_RANK = Object.freeze({ deny: 0, ask: 1, allow: 2 })
const ACTION_RANK = Object.freeze({ deny: 0, ask: 1, allow: 2 })
const DELEGATION_TOOLS = new Set([
  'delegate_task',
  'delegate_parallel',
  'delegate_chain',
  'run_subagent',
])
const EXPLORER_TOOLS = new Set(['read', 'grep', 'find', 'ls'])

export const MAX_DELEGATION_DEPTH = 2
export const MAX_SUBAGENT_TURNS = 20

function normalizeMode(value) {
  return Object.hasOwn(MODE_RANK, value) ? value : 'ask'
}

function restrictiveValue(left, right, ranks, fallback) {
  const a = Object.hasOwn(ranks, left) ? left : fallback
  const b = Object.hasOwn(ranks, right) ? right : fallback
  return ranks[a] <= ranks[b] ? a : b
}

function toolNamesFromSecurity(index) {
  if (index instanceof Map) return new Set(index.keys())
  if (index && typeof index === 'object') return new Set(Object.keys(index))
  return null
}

export function intersectPermissionRules(parentRules = {}, childRules = {}) {
  const result = {}
  const keys = new Set([
    ...Object.keys(parentRules || {}),
    ...Object.keys(childRules || {}),
  ])
  for (const key of keys) {
    const parent = parentRules?.[key]
    const child = childRules?.[key]
    if (parent === undefined) {
      result[key] = Object.hasOwn(ACTION_RANK, child) ? child : 'ask'
    } else if (child === undefined) {
      result[key] = parent
    } else {
      result[key] = restrictiveValue(parent, child, ACTION_RANK, 'ask')
    }
  }
  return result
}

export function deriveSubagentAuthority(def, parentConfig = {}, allTools = []) {
  const parentDepth = Math.max(0, Number(parentConfig.delegationDepth) || 0)
  if (parentDepth >= MAX_DELEGATION_DEPTH) {
    throw new Error(`Delegation depth limit reached (${MAX_DELEGATION_DEPTH})`)
  }

  const availableByName = new Map(
    (Array.isArray(allTools) ? allTools : [])
      .filter((tool) => tool && typeof tool.name === 'string')
      .map((tool) => [tool.name.toLowerCase(), tool]),
  )
  const indexedParentNames = toolNamesFromSecurity(parentConfig.toolSecurity)
  const explicitParentNames = Array.isArray(parentConfig.allowedToolNames)
    ? new Set(parentConfig.allowedToolNames)
    : null
  const parentNames = new Set(
    [...(explicitParentNames || indexedParentNames || availableByName.keys())]
      .map((name) => String(name).toLowerCase()),
  )

  const isExplorer = String(def?.name || '').toLowerCase() === 'explorer'
  const requested = isExplorer
    ? EXPLORER_TOOLS
    : new Set(
        (Array.isArray(def?.tools) ? def.tools : [])
          .map((name) => String(name).toLowerCase().trim())
          .filter(Boolean),
      )
  const allowedTools = [...requested]
    .filter((name) => parentNames.has(name))
    .filter((name) => !DELEGATION_TOOLS.has(name))
    .map((name) => availableByName.get(name))
    .filter(Boolean)

  const parentMode = normalizeMode(parentConfig.permissionMode)
  const childMode = isExplorer ? 'ask' : normalizeMode(def?.permissionMode)
  const permissionMode = restrictiveValue(parentMode, childMode, MODE_RANK, 'ask')
  const permissionRules = intersectPermissionRules(
    parentConfig.permissionRules,
    def?.permissionRules,
  )
  const requestedTurns = Math.max(1, Number(def?.maxTurns) || 10)
  const parentTurns = Math.max(
    1,
    Number(parentConfig.maxSubagentTurns) || MAX_SUBAGENT_TURNS,
  )
  const maxTurns = Math.min(requestedTurns, parentTurns, MAX_SUBAGENT_TURNS)

  const config = {
    ...parentConfig,
    permissionMode,
    permissionRules,
    workspaceRoots: Array.isArray(parentConfig.workspaceRoots)
      ? parentConfig.workspaceRoots.map((root) => ({ ...root }))
      : [],
    accessiblePaths: Array.isArray(parentConfig.accessiblePaths)
      ? [...parentConfig.accessiblePaths]
      : [],
    delegationDepth: parentDepth + 1,
    delegationParent: parentConfig.agentId || parentConfig.delegationParent || 'parent',
    allowedToolNames: allowedTools.map((tool) => tool.name),
    ...(allowedTools.some((tool) => ['web_search', 'web_fetch'].includes(tool.name))
      ? {}
      : { webSearchConfig: undefined }),
  }

  return {
    allowedTools,
    config,
    maxTurns,
    profile: isExplorer ? 'explorer' : 'custom',
  }
}
