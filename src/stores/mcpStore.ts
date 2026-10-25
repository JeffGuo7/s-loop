import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import type { MCPServerConfig, MCPServerStatus, MCPTool, MCPResource } from '../types/mcp';
import { getBaseUrl, waitForServer } from '../utils/piClient';
import {
  redactMCPServersForPersistence,
  splitMCPServerSecrets,
  type MCPSecretBundle,
} from '../utils/mcpConfigSecurity';

// All MCP transports (stdio and streamable HTTP) connect through the
// pi-server sidecar, which runs the MCP runtime built on pi 1.4's MCP client.
// Static secrets (headers, env) stay in the DPAPI-protected vault; OAuth
// tokens are owned by the sidecar's token store.

interface RemoteMCPTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface RemoteMCPResource {
  name: string;
  uri: string;
  description?: string;
  mimeType?: string;
}

interface RemoteMCPStatus {
  name: string;
  status?: string;
  connected?: boolean;
  transport?: string;
  error?: string | null;
  authorizationUrl?: string | null;
  tools?: RemoteMCPTool[];
  resources?: RemoteMCPResource[];
}

async function loadServerSecrets(name: string): Promise<MCPSecretBundle> {
  try {
    return await invoke<MCPSecretBundle>('mcp_secret_get', { name });
  } catch (error) {
    console.warn(`[mcp] Unable to load protected credentials for "${name}":`, error);
    return {};
  }
}

async function saveServerSecrets(config: MCPServerConfig): Promise<MCPServerConfig> {
  const split = splitMCPServerSecrets(config);
  if (Object.keys(split.secrets).length > 0) {
    await invoke('mcp_secret_merge', { name: config.name, values: split.secrets });
  }
  return split.config;
}

async function ensurePiServer(): Promise<void> {
  try {
    const response = await fetch(`${getBaseUrl()}/health`);
    if (response.ok) return;
  } catch {
    // The Tauri side may still be starting pi-server.
  }
  await waitForServer(10000);
}

function mapRemoteTools(tools: RemoteMCPTool[] = []): MCPTool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description || '',
    inputSchema: tool.inputSchema || {},
  }));
}

function mapRemoteResources(resources: RemoteMCPResource[] = []): MCPResource[] {
  return resources.map((resource) => ({
    name: resource.name || resource.uri,
    uri: resource.uri,
    description: resource.description || '',
    mimeType: resource.mimeType || undefined,
  }));
}

async function fetchMcpStatuses(): Promise<RemoteMCPStatus[]> {
  const res = await fetch(`${getBaseUrl()}/mcp-sse/status`);
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.json();
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

  // Connection
  connectServer: (name: string) => Promise<void>;
  disconnectServer: (name: string) => Promise<void>;
  installRemoteServer: (config: MCPServerConfig, autoConnect?: boolean) => Promise<void>;
}

const DEFAULT_SERVERS: MCPServerConfig[] = [];

export const useMCPStore = create<MCPState>()(
  persist(
    (set, get) => ({
      servers: DEFAULT_SERVERS,
      serverStatuses: {},

      addServer: (config) => {
        const split = splitMCPServerSecrets(config);
        set((state) => ({
          servers: [...state.servers, split.config],
        }));
        if (Object.keys(split.secrets).length > 0) {
          invoke('mcp_secret_merge', { name: config.name, values: split.secrets }).catch((error) => {
            console.warn(`[mcp] Unable to protect credentials for "${config.name}":`, error);
          });
        }
      },

      updateServer: (name, updates) => {
        const existing = get().servers.find((server) => server.name === name);
        if (!existing) return;
        const split = splitMCPServerSecrets({ ...existing, ...updates, name });
        set((state) => ({
          servers: state.servers.map((server) =>
            server.name === name ? split.config : server
          ),
        }));
        if (Object.keys(split.secrets).length > 0) {
          invoke('mcp_secret_merge', { name, values: split.secrets }).catch((error) => {
            console.warn(`[mcp] Unable to protect credentials for "${name}":`, error);
          });
        }
      },

      removeServer: (name) => {
        // Disconnect through the sidecar without re-adding a status entry
        // after the config has been removed.
        ensurePiServer()
          .then(() =>
            fetch(`${getBaseUrl()}/mcp-sse/disconnect`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name }),
            }),
          )
          .catch(() => {});
        invoke('mcp_secret_delete', { name }).catch(() => {});

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
          get().disconnectServer(name).catch(() => {});
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
          await ensurePiServer();
          const base = getBaseUrl();
          const secrets = server.hasStoredSecrets || server.auth?.type === 'oauth'
            ? await loadServerSecrets(name)
            : {};
          const resolvedEnv = { ...(secrets.env || {}), ...(server.env || {}) };

          const res = await fetch(`${base}/mcp-sse/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: server.name,
              // streamable HTTP (remote) or stdio — the runtime picks the
              // transport from the config shape.
              url: server.type === 'stdio' ? undefined : server.url,
              command: server.type === 'stdio' ? server.command : undefined,
              args: server.type === 'stdio' ? server.args : undefined,
              env: server.type === 'stdio' ? resolvedEnv : undefined,
              headers: server.type === 'stdio' ? undefined : { ...(secrets.headers || {}), ...(server.headers || {}) },
              auth: server.auth?.type === 'oauth'
                ? { type: 'oauth', clientId: server.auth.clientId }
                : server.auth,
              toolFilter: server.toolFilter,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Connection failed');

          if (data.status === 'auth-required') {
            get().setServerStatus(name, {
              status: 'auth-required',
              authorizationUrl: undefined,
              error: undefined,
              tools: [],
              resources: [],
            });

            // Run pi's OAuth flow: the authorization URL is reported through
            // /mcp-sse/status while the flow waits on the loopback callback.
            const signIn = fetch(`${base}/mcp-sse/oauth-start`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name }),
            }).catch(() => undefined);

            let authorizationUrl: string | undefined;
            for (let attempt = 0; attempt < 30; attempt += 1) {
              await new Promise((resolve) => setTimeout(resolve, 500));
              try {
                const statuses = await fetchMcpStatuses();
                authorizationUrl = statuses.find((item) => item.name === name)?.authorizationUrl || undefined;
                if (authorizationUrl) break;
              } catch {
                // Keep waiting for the flow to report the URL.
              }
            }
            if (authorizationUrl) {
              get().setServerStatus(name, { authorizationUrl });
              await openUrl(authorizationUrl);
            }

            void (async () => {
              await signIn;
              for (let attempt = 0; attempt < 120; attempt += 1) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
                try {
                  const statuses = await fetchMcpStatuses();
                  const connected = statuses.find(
                    (item) => item.name === name && item.status === 'connected',
                  );
                  if (!connected) continue;
                  useMCPStore.getState().setServerStatus(name, {
                    status: 'connected',
                    transport: connected.transport as MCPServerStatus['transport'],
                    authorizationUrl: undefined,
                    error: undefined,
                    tools: mapRemoteTools(connected.tools || []),
                    resources: mapRemoteResources(connected.resources || []),
                  });
                  return;
                } catch {
                  // Keep polling while the browser authorization flow is active.
                }
              }
            })();
            return;
          }

          get().setServerStatus(name, {
            status: 'connected',
            transport: data.transport as MCPServerStatus['transport'],
            authorizationUrl: undefined,
            error: undefined,
            tools: mapRemoteTools(data.tools || []),
            resources: mapRemoteResources(data.resources || []),
          });
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
          await ensurePiServer();
          const base = getBaseUrl();
          await fetch(`${base}/mcp-sse/disconnect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
          });
        } catch {
          // Ignore disconnect errors
        }
        get().setServerStatus(name, { status: 'disabled', tools: [], resources: [] });
      },

      installRemoteServer: async (config, autoConnect = true) => {
        const publicConfig = await saveServerSecrets(config);
        const existing = get().servers.find((server) => server.name === config.name);
        if (existing) {
          get().updateServer(config.name, publicConfig);
        } else {
          get().addServer(publicConfig);
        }

        if (autoConnect && !publicConfig.disabled) {
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

        try {
          await ensurePiServer();
          const statuses = await fetchMcpStatuses();
          const remote = statuses.find((item) => item.name === name);
          if (remote) {
            get().setServerStatus(name, {
              status: (remote.status as MCPServerStatus['status']) || (remote.connected ? 'connected' : 'error'),
              transport: remote.transport as MCPServerStatus['transport'],
              authorizationUrl: remote.authorizationUrl || undefined,
              error: remote.error || undefined,
              tools: mapRemoteTools(remote.tools || []),
              resources: mapRemoteResources(remote.resources || []),
            });
            return;
          }
        } catch {
          // fall through to a reconnect attempt
        }
        get().connectServer(name);
      },

      refreshAllServers: async () => {
        const { servers } = get();
        const enabledServers = servers.filter((s) => !s.disabled);
        const statusMap: Record<string, MCPServerStatus> = {};

        if (enabledServers.length > 0) {
          try {
            await ensurePiServer();
            const statuses = await fetchMcpStatuses();
            for (const s of statuses) {
              statusMap[s.name] = {
                name: s.name,
                status: (s.status as MCPServerStatus['status']) || (s.connected ? 'connected' : 'error'),
                error: s.error || undefined,
                authorizationUrl: s.authorizationUrl || undefined,
                transport: s.transport as MCPServerStatus['transport'],
                tools: mapRemoteTools(s.tools || []),
                resources: mapRemoteResources(s.resources || []),
              };
            }
          } catch {
            // If listing fails, fall back to individual refresh
            for (const server of enabledServers) {
              get().refreshServer(server.name).catch(() => {});
            }
          }
        }

        // Publish the snapshot before starting asynchronous connections. This
        // prevents connectServer() results from being overwritten by the
        // stale snapshot below.
        set({ serverStatuses: statusMap });

        // Try connecting servers that aren't yet connected
        for (const server of enabledServers) {
          if (!statusMap[server.name]) {
            get().connectServer(server.name).catch(() => {});
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
      name: 's-loop-mcp-storage',
      partialize: (state) => ({
        servers: redactMCPServersForPersistence(state.servers),
      }),
      merge: (persisted, current) => {
        const stored = (persisted as Partial<MCPState>)?.servers || [];
        const servers = stored.map((server) => {
          const split = splitMCPServerSecrets(server);
          if (Object.keys(split.secrets).length > 0) {
            invoke('mcp_secret_merge', {
              name: server.name,
              values: split.secrets,
            }).catch(() => {});
          }
          return split.config;
        });
        return { ...current, servers };
      },
    }
  )
);
