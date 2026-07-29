const VALID_RISKS = new Set(['read', 'write-local', 'exec', 'external'])
const VALID_APPROVAL_DEFAULTS = new Set(['allow', 'ask', 'deny'])
const VALID_SOURCES = new Set(['builtin', 'extension', 'skill', 'mcp'])

function metadata(risk, options = {}) {
  return Object.freeze({
    risk,
    pathArguments: options.pathArguments || [],
    ...(options.pathDefault ? { pathDefault: options.pathDefault } : {}),
    ...(options.targetArgument ? { targetArgument: options.targetArgument } : {}),
    approvalDefault: options.approvalDefault || 'allow',
    parallelSafe: options.parallelSafe === true,
    source: options.source || 'builtin',
  })
}

const BUILTIN_TOOL_SECURITY = new Map([
  ['read', metadata('read', { pathArguments: ['path'], parallelSafe: true })],
  ['grep', metadata('read', { pathArguments: ['path'], pathDefault: '.', parallelSafe: true })],
  ['find', metadata('read', { pathArguments: ['path'], pathDefault: '.', parallelSafe: true })],
  ['ls', metadata('read', { pathArguments: ['path'], pathDefault: '.', parallelSafe: true })],
  ['write', metadata('write-local', { pathArguments: ['path'] })],
  ['edit', metadata('write-local', { pathArguments: ['path'] })],
  ['apply_diff', metadata('write-local', { pathArguments: ['path', 'filePath', 'file_path'] })],
  ['replace_in_file', metadata('write-local', { pathArguments: ['path', 'filePath', 'file_path'] })],
  ['delete', metadata('write-local', { pathArguments: ['path', 'filePath', 'file_path'] })],
  ['remove', metadata('write-local', { pathArguments: ['path', 'filePath', 'file_path'] })],
  ['bash', metadata('exec')],
  ['web_search', metadata('read', { targetArgument: 'query', parallelSafe: true })],
  ['web_fetch', metadata('read', { targetArgument: 'url', parallelSafe: true })],
  ['get_current_time', metadata('read', { parallelSafe: true })],
  ['delegate_task', metadata('exec')],
  ['delegate_parallel', metadata('exec')],
  ['delegate_chain', metadata('exec')],
  ['run_subagent', metadata('exec')],
])

const MCP_DEFAULT_SECURITY = metadata('external', {
  approvalDefault: 'ask',
  source: 'mcp',
})

const UNKNOWN_TOOL_SECURITY = metadata('external', {
  approvalDefault: 'ask',
  source: 'extension',
})

export function validateToolSecurityMetadata(value, forcedSource) {
  if (!value || typeof value !== 'object') return null
  if (!VALID_RISKS.has(value.risk)) return null
  if (!VALID_APPROVAL_DEFAULTS.has(value.approvalDefault)) return null
  const source = forcedSource || value.source
  if (!VALID_SOURCES.has(source)) return null
  if (value.pathArguments !== undefined && (
    !Array.isArray(value.pathArguments)
    || value.pathArguments.some((key) => typeof key !== 'string' || !key)
  )) return null
  if (value.targetArgument !== undefined && typeof value.targetArgument !== 'string') return null
  return metadata(value.risk, {
    pathArguments: value.pathArguments,
    pathDefault: typeof value.pathDefault === 'string' ? value.pathDefault : undefined,
    targetArgument: value.targetArgument,
    approvalDefault: value.approvalDefault,
    parallelSafe: value.parallelSafe,
    source,
  })
}

export function getBuiltinToolSecurity(toolName) {
  return BUILTIN_TOOL_SECURITY.get(String(toolName || '').toLowerCase()) || null
}

export function buildToolSecurityIndex(tools = []) {
  const index = new Map()
  for (const tool of Array.isArray(tools) ? tools : []) {
    if (!tool || typeof tool.name !== 'string') continue
    let resolved = null
    if (tool._sandboxCategory === 'mcp' || tool._mcpServer) {
      resolved = validateToolSecurityMetadata(tool._snotraSecurity || tool.security, 'mcp')
        || MCP_DEFAULT_SECURITY
    } else if (tool._extension) {
      resolved = validateToolSecurityMetadata(tool._snotraSecurity || tool.security, 'extension')
        || UNKNOWN_TOOL_SECURITY
    } else {
      resolved = validateToolSecurityMetadata(tool._snotraSecurity || tool.security)
        || getBuiltinToolSecurity(tool.name)
    }
    if (resolved) index.set(tool.name, resolved)
  }
  return index
}

function getIndexedMetadata(index, toolName) {
  if (index instanceof Map) return index.get(toolName)
  if (index && typeof index === 'object') return index[toolName]
  return undefined
}

export function resolveToolSecurity(toolName, config = {}) {
  const indexed = validateToolSecurityMetadata(
    getIndexedMetadata(config.toolSecurity, toolName),
  )
  if (indexed) return { metadata: indexed, declared: true }

  const isMcp = config.isMcp === true || config.mcpToolNames?.has?.(toolName)
  if (isMcp) return { metadata: MCP_DEFAULT_SECURITY, declared: true }

  const builtin = getBuiltinToolSecurity(toolName)
  if (builtin) return { metadata: builtin, declared: true }

  return { metadata: UNKNOWN_TOOL_SECURITY, declared: false }
}
