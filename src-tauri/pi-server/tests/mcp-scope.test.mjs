import assert from 'node:assert/strict'
import test from 'node:test'
import { filterRemoteMcpTools } from '../mcp-scope.mjs'

const local = { name: 'read' }
const githubIssue = {
  name: 'mcp_sse_github_create_issue',
  _mcpServer: 'github',
  _mcpToolName: 'create_issue',
}
const githubRead = {
  name: 'mcp_sse_github_get_issue',
  _mcpServer: 'github',
  _mcpToolName: 'get_issue',
}

test('an empty agent MCP scope denies remote tools without hiding local tools', () => {
  assert.deepEqual(filterRemoteMcpTools([local, githubIssue], {
    serverNames: [],
    tools: [],
  }), [local])
})

test('agent MCP scope supports mounted servers, explicit tools, and chat name filters', () => {
  assert.deepEqual(filterRemoteMcpTools([githubIssue, githubRead], {
    serverNames: ['github'],
    tools: [],
  }), [githubIssue, githubRead])
  assert.deepEqual(filterRemoteMcpTools([githubIssue, githubRead], {
    serverNames: [],
    tools: [{ serverName: 'github', toolName: 'get_issue' }],
  }), [githubRead])
  assert.deepEqual(filterRemoteMcpTools([githubIssue, githubRead], {
    toolNames: ['mcp_sse_github_create_issue'],
  }), [githubIssue])
})

test('missing scope preserves legacy unrestricted behavior', () => {
  assert.deepEqual(filterRemoteMcpTools([local, githubIssue], undefined), [local, githubIssue])
})
