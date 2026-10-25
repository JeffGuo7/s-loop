import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useMCPStore } from '../../src/stores/mcpStore'

// All MCP transports now connect through the pi-server sidecar over HTTP.
// These tests mock global fetch for the sidecar endpoints; `invoke` (the
// DPAPI secret vault) stays mocked through the @tauri-apps/api/core alias.
import { invoke } from '@tauri-apps/api/core'

const fetchMock = vi.fn()

function mockSidecar({ health = true, connect, status } = {}) {
  fetchMock.mockImplementation(async (input: any) => {
    const url = String(input)
    if (url.endsWith('/health')) {
      return { ok: health } as Response
    }
    if (url.endsWith('/mcp-sse/connect')) {
      if (connect instanceof Error) throw connect
      return {
        ok: !connect?.error,
        json: async () => connect ?? { ok: true },
      } as Response
    }
    if (url.endsWith('/mcp-sse/status')) {
      return { ok: true, json: async () => status ?? [] } as Response
    }
    if (url.endsWith('/mcp-sse/disconnect')) {
      return { ok: true, json: async () => ({ ok: true }) } as Response
    }
    return { ok: false, json: async () => ({}) } as Response
  })
}

beforeEach(() => {
  useMCPStore.setState({
    servers: [],
    serverStatuses: {},
  })
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  mockSidecar()
})

afterEach(() => {
  vi.unstubAllGlobals()
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

  it('removes a server and disconnects through the sidecar', async () => {
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
    // The disconnect is fire-and-forget; give it a tick.
    await new Promise((resolve) => setTimeout(resolve, 0))

    const state = useMCPStore.getState()
    expect(state.servers).toHaveLength(0)
    expect(state.serverStatuses['my-server']).toBeUndefined()
    const disconnectCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/mcp-sse/disconnect'))
    expect(disconnectCall).toBeTruthy()
    expect(JSON.parse(disconnectCall![1].body)).toEqual({ name: 'my-server' })
    // Static secrets are still dropped from the DPAPI vault.
    expect(invoke).toHaveBeenCalledWith('mcp_secret_delete', { name: 'my-server' })
  })

  it('connects a stdio server through the sidecar and updates status', async () => {
    mockSidecar({
      connect: { ok: true, status: 'connected', transport: 'stdio', tools: [{ name: 'hello', description: 'Greet', inputSchema: {} }], resources: [] },
    })

    useMCPStore.getState().addServer({
      name: 'my-server',
      type: 'stdio',
      command: 'node',
      args: ['server.mjs'],
    })

    await useMCPStore.getState().connectServer('my-server')

    const connectCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/mcp-sse/connect'))
    expect(connectCall).toBeTruthy()
    expect(JSON.parse(connectCall![1].body)).toMatchObject({
      name: 'my-server',
      command: 'node',
      args: ['server.mjs'],
    })

    const status = useMCPStore.getState().serverStatuses['my-server']
    expect(status?.status).toBe('connected')
    expect(status?.tools).toHaveLength(1)
  })

  it('tracks status changes when connecting fails', async () => {
    mockSidecar({ connect: { error: 'Connection refused' } })

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

    // Toggle to enable — should call connectServer internally (which hits the
    // sidecar connect endpoint).
    useMCPStore.getState().toggleServer('my-server')

    const server = useMCPStore.getState().servers[0]
    expect(server.disabled).toBeFalsy()
  })

  it('refreshes statuses for all servers from the sidecar', async () => {
    mockSidecar({
      status: [{ name: 's1', status: 'connected', transport: 'stdio', tools: [], resources: [] }],
    })

    useMCPStore.getState().addServer({ name: 's1', type: 'stdio', command: 'node', args: [] })
    useMCPStore.getState().addServer({ name: 's2', type: 'stdio', command: 'node', args: [] })

    await useMCPStore.getState().refreshAllServers()

    const statuses = useMCPStore.getState().serverStatuses
    expect(statuses['s1']?.status).toBe('connected')
    // s2 is enabled but not connected on the sidecar — the store starts a
    // connection for it, so it should not be marked disabled.
    expect(statuses['s2']?.status).not.toBe('disabled')
  })

  it('refreshes a single enabled server from the sidecar', async () => {
    mockSidecar({
      status: [{
        name: 'my-server',
        status: 'connected',
        transport: 'streamable-http',
        tools: [{ name: 'read', description: 'Read file', inputSchema: {} }],
        resources: [],
      }],
    })

    useMCPStore.getState().addServer({ name: 'my-server', type: 'http', url: 'https://example.com/mcp' })

    await useMCPStore.getState().refreshServer('my-server')

    const status = useMCPStore.getState().serverStatuses['my-server']
    expect(status?.status).toBe('connected')
    expect(status?.tools).toHaveLength(1)
    expect(status?.tools[0].name).toBe('read')
  })
})
