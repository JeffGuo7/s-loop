import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MCPServerConfig, MCPServerStatus } from '../types/mcp';

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
}

// Built-in MCP servers
const DEFAULT_SERVERS: MCPServerConfig[] = [
  {
    name: 'filesystem',
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
    disabled: true,
  },
];

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
        set((state) => ({
          servers: state.servers.map((s) =>
            s.name === name ? { ...s, disabled: !s.disabled } : s
          ),
        }));
      },

      setServerStatus: (name, status) => {
        set((state) => ({
          serverStatuses: {
            ...state.serverStatuses,
            [name]: { ...state.serverStatuses[name], ...status } as MCPServerStatus,
          },
        }));
      },

      refreshServer: async (name) => {
        const { servers, setServerStatus } = get();
        const server = servers.find((s) => s.name === name);

        if (!server || server.disabled) {
          setServerStatus(name, { status: 'disabled', tools: [], resources: [] });
          return;
        }

        setServerStatus(name, { status: 'connecting', tools: [], resources: [] });

        try {
          // TODO: Implement actual MCP connection via Tauri backend
          // For now, simulate connection
          await new Promise((resolve) => setTimeout(resolve, 500));

          setServerStatus(name, {
            status: 'connected',
            tools: [],
            resources: [],
          });
        } catch (error) {
          setServerStatus(name, {
            status: 'error',
            error: error instanceof Error ? error.message : 'Connection failed',
            tools: [],
            resources: [],
          });
        }
      },

      refreshAllServers: async () => {
        const { servers, refreshServer } = get();
        await Promise.all(
          servers
            .filter((s) => !s.disabled)
            .map((s) => refreshServer(s.name))
        );
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