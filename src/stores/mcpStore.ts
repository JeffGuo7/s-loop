import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import type { MCPServerConfig, MCPServerStatus, MCPTool } from '../types/mcp';

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
        try {
          await invoke('mcp_disconnect', { name });
        } catch {
          // Ignore disconnect errors
        }
        get().setServerStatus(name, { status: 'disabled', tools: [], resources: [] });
      },

      refreshServer: async (name) => {
        const { servers } = get();
        const server = servers.find((s) => s.name === name);
        if (!server || server.disabled) {
          get().setServerStatus(name, { status: 'disabled', tools: [], resources: [] });
          return;
        }

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

        try {
          const statuses = await invoke<RustMCPServerStatus[]>('mcp_list_servers');
          const statusMap: Record<string, MCPServerStatus> = {};
          for (const s of statuses) {
            statusMap[s.name] = mapRustStatus(s);
          }
          set({ serverStatuses: statusMap });
        } catch {
          // If listing fails, refresh each server individually
          for (const server of enabledServers) {
            get().refreshServer(server.name).catch(() => {});
          }
        }

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
