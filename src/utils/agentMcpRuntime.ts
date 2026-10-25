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
  // Matches pi 1.4's MCP naming used by the sidecar runtime (mcp-runtime.mjs).
  return `mcp__${serverName}__${toolName}`
}
