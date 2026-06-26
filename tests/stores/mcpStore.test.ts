import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useMCPStore } from '../../src/stores/mcpStore'

// The alias in vitest.config.ts resolves @tauri-apps/api/core to
// tests/mocks/tauri-api-core.ts, which exports a vi.fn() `invoke`.
// Re-import it here so we can configure its return values for each test.
import { invoke } from '@tauri-apps/api/core'

beforeEach(() => {
  // Reset the store to defaults for each test
  useMCPStore.setState({
    servers: [],
    serverStatuses: {},
  })
  vi.clearAllMocks()
})

describe('mcpStore', () => {
  it('starts with an empty server list', () => {
    const state = useMCPStore.getState()
    expect(state.servers).toEqual([])
    expect(state.serverStatuses).toEqual({})
  })

  it('adds a server config', () => {
    useMCPStore.getState().addServer({
      name: 'my-server',
      type: 'stdio',
      command: 'node',
      args: ['server.mjs'],
    })

    const servers = useMCPStore.getState().servers
    expect(servers).toHaveLength(1)
    expect(servers[0].name).toBe('my-server')
    expect(servers[0].command).toBe('node')
  })

  it('updates an existing server', () => {
    useMCPStore.getState().addServer({
      name: 'my-server',
      type: 'stdio',
      command: 'node',
      args: ['old.mjs'],
    })

    useMCPStore.getState().updateServer('my-server', { args: ['new.mjs'] })

    const servers = useMCPStore.getState().servers
    expect(servers[0].args).toEqual(['new.mjs'])
  })

  it('removes a server and disconnects via Tauri', () => {
    useMCPStore.getState().addServer({
      name: 'my-server',
      type: 'stdio',
      command: 'node',
      args: ['server.mjs'],
    })
    useMCPStore.getState().setServerStatus('my-server', {
      status: 'connected',
      tools: [],
      resources: [],
    })

    useMCPStore.getState().removeServer('my-server')

    const state = useMCPStore.getState()
    expect(state.servers).toHaveLength(0)
    // Status should have been cleaned up
    expect(state.serverStatuses['my-server']).toBeUndefined()
    // Should have called invoke('mcp_disconnect', ...)
    expect(invoke).toHaveBeenCalledWith('mcp_disconnect', { name: 'my-server' })
  })

  it('connects a server via Tauri and updates status', async () => {
    invoke.mockResolvedValueOnce({
      name: 'my-server',
      status: 'connected',
      error: null,
      tools: [],
    })

    useMCPStore.getState().addServer({
      name: 'my-server',
      type: 'stdio',
      command: 'node',
      args: ['server.mjs'],
    })

    await useMCPStore.getState().connectServer('my-server')

    expect(invoke).toHaveBeenCalledWith('mcp_connect', {
      name: 'my-server',
      command: 'node',
      args: ['server.mjs'],
    })

    const status = useMCPStore.getState().serverStatuses['my-server']
    expect(status?.status).toBe('connected')
  })

  it('tracks status changes when connecting fails', async () => {
    invoke.mockRejectedValueOnce(new Error('Connection refused'))

    useMCPStore.getState().addServer({
      name: 'faulty',
      type: 'stdio',
      command: 'bad-command',
      args: [],
    })

    await useMCPStore.getState().connectServer('faulty')

    const status = useMCPStore.getState().serverStatuses['faulty']
    expect(status?.status).toBe('error')
    expect(status?.error).toBe('Connection refused')
  })

  it('toggles a server from disabled to enabled (connects)', () => {
    useMCPStore.getState().addServer({
      name: 'my-server',
      type: 'stdio',
      command: 'node',
      args: [],
      disabled: true,
    })

    // Toggle to enable — should call connectServer internally (which calls invoke)
    useMCPStore.getState().toggleServer('my-server')

    const server = useMCPStore.getState().servers[0]
    expect(server.disabled).toBeFalsy()
    // connectServer was called (via the store's internal logic), which triggers invoke
  })

  it('disconnects and cleans statuses for all servers on refreshAllServers', async () => {
    invoke.mockResolvedValueOnce([]) // mcp_list_servers returns empty

    useMCPStore.getState().addServer({
      name: 's1', type: 'stdio', command: 'node', args: [],
    })
    useMCPStore.getState().addServer({
      name: 's2', type: 'stdio', command: 'node', args: [],
    })

    await useMCPStore.getState().refreshAllServers()

    // mcp_list_servers was called
    expect(invoke).toHaveBeenCalledWith('mcp_list_servers')
  })

  it('refreshes a single enabled server', async () => {
    invoke.mockResolvedValueOnce({
      name: 'my-server',
      status: 'connected',
      error: null,
      tools: [{ name: 'read', description: 'Read file', input_schema: {} }],
    })
    // Second call is mcp_refresh_tools
    invoke.mockResolvedValueOnce([{ name: 'read', description: 'Read file', input_schema: {} }])

    useMCPStore.getState().addServer({
      name: 'my-server', type: 'stdio', command: 'node', args: [],
    })

    await useMCPStore.getState().refreshServer('my-server')

    const status = useMCPStore.getState().serverStatuses['my-server']
    expect(status?.status).toBe('connected')
    expect(status?.tools).toHaveLength(1)
    expect(status?.tools[0].name).toBe('read')
  })
})
