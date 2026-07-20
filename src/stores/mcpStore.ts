import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import type { MCPServerConfig, MCPServerStatus, MCPTool } from '../types/mcp';
import { getBaseUrl } from '../utils/piClient';

// ---- Tauri command response types (matches Rust mcp_manager.rs) ----

interface RustMCPTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface RustMCPServerStatus {
  name: string;
  status: string;
  error: string | null;
  tools: RustMCPTool[];
}

interface MCPState {
  servers: MCPServerConfig[];
  serverStatuses: Record<string, MCPServerStatus>;

  // Actions
  addServer: (config: MCPServerConfig) => void;
  updateServer: (name: string, config: Partial<MCPServerConfig>) => void;
  removeServer: (name: string) => void;
  toggleServer: (name: string) => void;

  // Status
  setServerStatus: (name: string, status: Partial<MCPServerStatus>) => void;
  refreshServer: (name: string) => Promise<void>;
  refreshAllServers: () => Promise<void>;

  // Direct MCP operations (via Tauri)
  connectServer: (name: string) => Promise<void>;
  disconnectServer: (name: string) => Promise<void>;
  installRemoteServer: (config: MCPServerConfig, autoConnect?: boolean) => Promise<void>;
}

// Helper to map Rust type to local type
function mapRustTools(tools: RustMCPTool[]): MCPTool[] {
  return tools.map(t => ({
    name: t.name,
    description: t.description || '',
    inputSchema: t.input_schema || {},
  }));
}

function mapRustStatus(rs: RustMCPServerStatus): MCPServerStatus {
  return {
    name: rs.name,
    status: (rs.status as MCPServerStatus['status']) || 'error',
    error: rs.error || undefined,
    tools: mapRustTools(rs.tools || []),
    resources: [],
  };
}

const DEFAULT_SERVERS: MCPServerConfig[] = [];

export const useMCPStore = create<MCPState>()(
  persist(
    (set, get) => ({
      servers: DEFAULT_SERVERS,
      serverStatuses: {},

      addServer: (config) => {
        set((state) => ({
          servers: [...state.servers, config],
        }));
      },

      updateServer: (name, updates) => {
        set((state) => ({
          servers: state.servers.map((s) =>
            s.name === name ? { ...s, ...updates } : s
          ),
        }));
      },

      removeServer: (name) => {
        // Disconnect from Rust backend first
        invoke('mcp_disconnect', { name }).catch(() => {});

        set((state) => {
          const newStatuses = { ...state.serverStatuses };
          delete newStatuses[name];
          return {
            servers: state.servers.filter((s) => s.name !== name),
            serverStatuses: newStatuses,
          };
        });
      },

      toggleServer: (name) => {
        const { servers } = get();
        const server = servers.find((s) => s.name === name);
        if (!server) return;

        const wasDisabled = !!server.disabled;

        set((state) => ({
          servers: state.servers.map((s) =>
            s.name === name ? { ...s, disabled: !s.disabled } : s
          ),
        }));

        if (wasDisabled) {
          // Was disabled, now enabling → connect
          get().connectServer(name);
        } else {
          // Was enabled, now disabling → disconnect
          get().setServerStatus(name, { status: 'disabled', tools: [], resources: [] });
          invoke('mcp_disconnect', { name }).catch(() => {});
        }
      },

      setServerStatus: (name, status) => {
        set((state) => ({
          serverStatuses: {
            ...state.serverStatuses,
            [name]: { ...state.serverStatuses[name], ...status } as MCPServerStatus,
          },
        }));
      },

      connectServer: async (name) => {
        const { servers } = get();
        const server = servers.find((s) => s.name === name);
        if (!server || server.disabled) return;

        get().setServerStatus(name, { status: 'connecting', tools: [], resources: [] });

        // SSE/HTTP type: connect via pi-server
        if (server.type === 'sse' || server.type === 'http') {
          try {
            const base = getBaseUrl();
            const res = await fetch(`${base}/mcp-sse/connect`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: server.name,
                url: server.url,
                headers: server.headers || {},
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Connection failed');

            const tools = (data.tools || []).map((t: any) => ({
              name: t.name,
              description: t.description || '',
              inputSchema: t.inputSchema || {},
            }));

            get().setServerStatus(name, {
              status: 'connected',
              tools,
              resources: [],
            });
          } catch (error) {
            get().setServerStatus(name, {
              status: 'error',
              error: error instanceof Error ? error.message : String(error),
              tools: [],
              resources: [],
            });
          }
          return;
        }

        // stdio type: connect via Rust backend
        get().setServerStatus(name, { status: 'connecting', tools: [], resources: [] });

        try {
          const command = server.type === 'stdio' ? (server.command || '') : '';
          const args = server.type === 'stdio' ? (server.args || []) : [];

          const result = await invoke<RustMCPServerStatus>('mcp_connect', {
            name,
            command,
            args,
          });

          get().setServerStatus(name, mapRustStatus(result));

          // If connected successfully, refresh tools in the background
          if (result.status === 'connected') {
            invoke<RustMCPTool[]>('mcp_refresh_tools', { name })
              .then((tools) => {
                get().setServerStatus(name, {
                  tools: mapRustTools(tools || []),
                });
              })
              .catch((err) => {
                console.warn(`[mcp] Failed to refresh tools for '${name}':`, err);
              });
          }
        } catch (error) {
          get().setServerStatus(name, {
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
            tools: [],
            resources: [],
          });
        }
      },

      disconnectServer: async (name) => {
        const { servers } = get();
        const server = servers.find((s) => s.name === name);

        // SSE/HTTP type: disconnect via pi-server
        if (server && (server.type === 'sse' || server.type === 'http')) {
          try {
            const base = getBaseUrl();
            await fetch(`${base}/mcp-sse/disconnect`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name }),
            });
          } catch {
            // Ignore disconnect errors
          }
        } else {
          // stdio type: disconnect via Rust backend
          try {
            await invoke('mcp_disconnect', { name });
          } catch {
            // Ignore disconnect errors
          }
        }
        get().setServerStatus(name, { status: 'disabled', tools: [], resources: [] });
      },

      installRemoteServer: async (config, autoConnect = true) => {
        const existing = get().servers.find((server) => server.name === config.name);
        if (existing) {
          get().updateServer(config.name, config);
        } else {
          get().addServer(config);
        }

        if (autoConnect && !config.disabled) {
          await get().connectServer(config.name);
        }
      },

      refreshServer: async (name) => {
        const { servers } = get();
        const server = servers.find((s) => s.name === name);
        if (!server || server.disabled) {
          get().setServerStatus(name, { status: 'disabled', tools: [], resources: [] });
          return;
        }

        // SSE/HTTP: refresh via pi-server status
        if (server.type === 'sse' || server.type === 'http') {
          try {
            const base = getBaseUrl();
            const res = await fetch(`${base}/mcp-sse/status`);
            if (res.ok) {
              const sseStatuses = await res.json();
              const sseServer = sseStatuses.find((s: any) => s.name === name);
              if (sseServer) {
                get().setServerStatus(name, {
                  status: 'connected',
                  tools: (sseServer.tools || []).map((t: any) => ({
                    name: t.name,
                    description: t.description || '',
                    inputSchema: {},
                  })),
                  resources: [],
                });
                return;
              }
            }
          } catch {}
          // Not connected, try to connect
          get().connectServer(name);
          return;
        }

        // stdio: refresh via Rust backend
        try {
          const status = await invoke<RustMCPServerStatus>('mcp_get_status', { name });
          get().setServerStatus(name, mapRustStatus(status));

          // Refresh tools in background
          if (status.status === 'connected') {
            const tools = await invoke<RustMCPTool[]>('mcp_refresh_tools', { name });
            get().setServerStatus(name, { tools: mapRustTools(tools || []) });
          }
        } catch {
          // Not connected, try to connect
          get().connectServer(name);
        }
      },

      refreshAllServers: async () => {
        const { servers } = get();
        const enabledServers = servers.filter((s) => !s.disabled);
        const statusMap: Record<string, MCPServerStatus> = {};

        // Fetch stdio MCP status from Rust backend
        try {
          const statuses = await invoke<RustMCPServerStatus[]>('mcp_list_servers');
          for (const s of statuses) {
            statusMap[s.name] = mapRustStatus(s);
          }
        } catch {
          // If listing fails, fallback to individual refresh
          for (const server of enabledServers) {
            if (server.type === 'stdio') {
              get().refreshServer(server.name).catch(() => {});
            }
          }
        }

        // Fetch SSE MCP status from pi-server
        try {
          const base = getBaseUrl();
          const res = await fetch(`${base}/mcp-sse/status`);
          if (res.ok) {
            const sseStatuses = await res.json();
            for (const s of sseStatuses) {
              statusMap[s.name] = {
                name: s.name,
                status: 'connected',
                tools: (s.tools || []).map((t: any) => ({
                  name: t.name,
                  description: t.description || '',
                  inputSchema: {},
                })),
                resources: [],
              };
            }
          }
        } catch {}

        // Try connecting SSE servers that aren't yet connected
        for (const server of enabledServers) {
          if ((server.type === 'sse' || server.type === 'http') && !statusMap[server.name]) {
            get().connectServer(server.name).catch(() => {});
          }
        }

        set({ serverStatuses: statusMap });

        // Mark disabled servers
        for (const server of servers) {
          if (server.disabled) {
            get().setServerStatus(server.name, { status: 'disabled', tools: [], resources: [] });
          }
        }
      },
    }),
    {
      name: 'snotra-mcp-storage',
      partialize: (state) => ({
        servers: state.servers,
      }),
    }
  )
);
