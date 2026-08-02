import { describe, expect, it } from 'vitest'
import { isAgentMcpToolAllowed, remoteMcpToolName } from '../src/utils/agentMcpRuntime'

describe('agent MCP runtime selection', () => {
  it('treats an empty agent selection as no MCP authority', () => {
    const agent = { mcpServers: [], mcpTools: [] }
    expect(isAgentMcpToolAllowed(agent, 'filesystem', 'read_file')).toBe(false)
  })

  it('allows a whole mounted server or one explicitly mounted tool', () => {
    const agent = {
      mcpServers: ['github'],
      mcpTools: [{ serverName: 'filesystem', toolName: 'read_file' }],
    }
    expect(isAgentMcpToolAllowed(agent, 'github', 'create_issue')).toBe(true)
    expect(isAgentMcpToolAllowed(agent, 'filesystem', 'read_file')).toBe(true)
    expect(isAgentMcpToolAllowed(agent, 'filesystem', 'write_file')).toBe(false)
  })

  it('keeps global mode unrestricted and matches sidecar remote names', () => {
    expect(isAgentMcpToolAllowed(null, 'any', 'tool')).toBe(true)
    expect(remoteMcpToolName('modern-test', 'echo')).toBe('mcp_sse_modern_test_echo')
  })
})
