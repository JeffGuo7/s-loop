import type { Agent } from '../types/agent'

type AgentMcpSelection = Pick<Agent, 'mcpServers' | 'mcpTools'>

export function isAgentMcpToolAllowed(
  agent: AgentMcpSelection | null | undefined,
  serverName: string,
  toolName: string,
): boolean {
  if (!agent) return true
  if (agent.mcpServers.includes(serverName)) return true
  return agent.mcpTools.some((tool) => (
    tool.serverName === serverName && tool.toolName === toolName
  ))
}

export function remoteMcpToolName(serverName: string, toolName: string): string {
  const safeServerName = serverName.replace(/[^a-zA-Z0-9]/g, '_')
  return `mcp_sse_${safeServerName}_${toolName}`
}
