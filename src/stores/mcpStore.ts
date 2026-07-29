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

async function syncOAuthCredentials(name: string): Promise<void> {
  try {
    const response = await fetch(
      `${getBaseUrl()}/mcp-oauth/credentials?name=${encodeURIComponent(name)}`,
    );
    if (!response.ok) return;
    const oauth = await response.json();
    if (oauth && Object.keys(oauth).length > 0) {
      await invoke('mcp_secret_merge', { name, values: { oauth } });
    }
  } catch {
    // OAuth credentials are exported only after a successful flow.
  }
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
        // Disconnect from the correct backend without re-adding a status entry
        // after the config has been removed.
        const server = get().servers.find((item) => item.name === name);
        if (server?.type === 'sse' || server?.type === 'http') {
          ensurePiServer().then(() => fetch(`${getBaseUrl()}/mcp-sse/disconnect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
          })).catch(() => {});
        } else {
          invoke('mcp_disconnect', { name }).catch(() => {});
        }
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

        // SSE/HTTP type: connect via pi-server
        if (server.type === 'sse' || server.type === 'http') {
          try {
            await ensurePiServer();
            const base = getBaseUrl();
            const secrets = server.hasStoredSecrets || server.auth?.type === 'oauth'
              ? await loadServerSecrets(name)
              : {};
            const res = await fetch(`${base}/mcp-sse/connect`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: server.name,
                url: server.url,
                headers: { ...(secrets.headers || {}), ...(server.headers || {}) },
                auth: server.auth?.type === 'oauth'
                  ? {
                      ...server.auth,
                      credentials: secrets.oauth || {},
                      redirectUrl: `${base}/mcp-oauth/callback/${encodeURIComponent(server.name)}`,
                    }
                  : server.auth,
                toolFilter: server.toolFilter,
                // Older S-Loop versions inferred every URL as `sse`. Treat
                // that persisted value as auto-detect so existing configs also
                // get the modern-first path.
                transport: server.type === 'sse' ? 'http' : server.type,
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Connection failed');

            if (data.authRequired && data.authorizationUrl) {
              get().setServerStatus(name, {
                status: 'auth-required',
                authorizationUrl: data.authorizationUrl,
                error: undefined,
                tools: [],
                resources: [],
              });
              await openUrl(data.authorizationUrl);
              void (async () => {
                for (let attempt = 0; attempt < 120; attempt += 1) {
                  await new Promise((resolve) => setTimeout(resolve, 1000));
                  try {
                    const statusResponse = await fetch(`${base}/mcp-sse/status`);
                    if (!statusResponse.ok) continue;
                    const statuses = await statusResponse.json();
                    const connected = statuses.find(
                      (item: { name?: string; status?: string }) =>
                        item.name === name && item.status === 'connected',
                    );
                    if (!connected) continue;
                    await syncOAuthCredentials(name);
                    useMCPStore.getState().setServerStatus(name, {
                      status: 'connected',
                      transport: connected.transport,
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

            await syncOAuthCredentials(name);
            get().setServerStatus(name, {
              status: 'connected',
              transport: data.transport,
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
          return;
        }

        // stdio type: connect via Rust backend
        get().setServerStatus(name, { status: 'connecting', tools: [], resources: [] });

        try {
          const command = server.type === 'stdio' ? (server.command || '') : '';
          const args = server.type === 'stdio' ? (server.args || []) : [];
          const secrets = server.hasStoredSecrets
            ? await loadServerSecrets(name)
            : {};
          const resolvedEnv = { ...(secrets.env || {}), ...(server.env || {}) };

          const result = await invoke<RustMCPServerStatus>('mcp_connect', {
            name,
            command,
            args,
            ...(Object.keys(resolvedEnv).length > 0 ? { env: resolvedEnv } : {}),
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

        // SSE/HTTP: refresh via pi-server status
        if (server.type === 'sse' || server.type === 'http') {
          try {
            await ensurePiServer();
            const base = getBaseUrl();
            const res = await fetch(`${base}/mcp-sse/status`);
            if (res.ok) {
              const sseStatuses = await res.json();
              const sseServer = sseStatuses.find((s: any) => s.name === name);
              if (sseServer) {
                await syncOAuthCredentials(name);
                get().setServerStatus(name, {
                  status: 'connected',
                  transport: sseServer.transport,
                  authorizationUrl: undefined,
                  error: undefined,
                  tools: mapRemoteTools(sseServer.tools || []),
                  resources: mapRemoteResources(sseServer.resources || []),
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

        // Fetch remote MCP status only when remote servers are configured. This
        // keeps stdio-only startup fast and avoids waiting for pi-server in
        // browser/unit-test environments.
        if (enabledServers.some((server) => server.type === 'sse' || server.type === 'http')) {
          try {
            await ensurePiServer();
            const base = getBaseUrl();
            const res = await fetch(`${base}/mcp-sse/status`);
            if (res.ok) {
              const sseStatuses = await res.json();
              for (const s of sseStatuses) {
                if (s.status === 'connected') {
                  await syncOAuthCredentials(s.name);
                }
                statusMap[s.name] = {
                  name: s.name,
                  status: s.status || (s.connected ? 'connected' : 'error'),
                  error: s.error || undefined,
                  authorizationUrl: s.authorizationUrl || undefined,
                  transport: s.transport,
                  tools: mapRemoteTools(s.tools || []),
                  resources: mapRemoteResources(s.resources || []),
                };
              }
            }
          } catch {}
        }

        // Publish the snapshot before starting asynchronous connections. This
        // prevents connectServer() results from being overwritten by the
        // stale snapshot below.
        set({ serverStatuses: statusMap });

        // Try connecting remote servers that aren't yet connected
        for (const server of enabledServers) {
          if ((server.type === 'sse' || server.type === 'http') && !statusMap[server.name]) {
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
      name: 'snotra-mcp-storage',
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
