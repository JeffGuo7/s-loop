export function isRemoteMcpToolAllowed(tool, scope) {
  if (!tool?._mcpServer) return true
  if (scope === undefined || scope === null) return true

  if (Array.isArray(scope.toolNames)) {
    return scope.toolNames.includes(tool.name)
  }
  if (Array.isArray(scope.serverNames) && scope.serverNames.includes(tool._mcpServer)) {
    return true
  }
  return Array.isArray(scope.tools) && scope.tools.some((candidate) => (
    candidate?.serverName === tool._mcpServer
    && candidate?.toolName === tool._mcpToolName
  ))
}

export function filterRemoteMcpTools(tools, scope) {
  return tools.filter((tool) => isRemoteMcpToolAllowed(tool, scope))
}
