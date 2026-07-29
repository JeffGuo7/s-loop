import type { MCPServerConfig } from '../types/mcp';

export interface MCPSecretBundle {
  headers?: Record<string, string>;
  env?: Record<string, string>;
  oauth?: Record<string, unknown>;
}

function nonEmptyRecord(value: unknown): value is Record<string, string> {
  return !!value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.values(value).some((item) => typeof item === 'string' && item.length > 0);
}

export function splitMCPServerSecrets(config: MCPServerConfig): {
  config: MCPServerConfig;
  secrets: MCPSecretBundle;
} {
  const { headers, env, ...publicConfig } = config;
  const secrets: MCPSecretBundle = {};
  if (nonEmptyRecord(headers)) secrets.headers = { ...headers };
  if (nonEmptyRecord(env)) secrets.env = { ...env };

  const hasAuthorization = Object.keys(headers || {})
    .some((key) => key.toLowerCase() === 'authorization');
  const auth = publicConfig.auth || (hasAuthorization ? { type: 'bearer' as const } : undefined);

  return {
    config: {
      ...publicConfig,
      ...(auth ? { auth } : {}),
      hasStoredSecrets: publicConfig.hasStoredSecrets
        || Object.keys(secrets).length > 0,
    },
    secrets,
  };
}

export function redactMCPServersForPersistence(
  servers: MCPServerConfig[],
): MCPServerConfig[] {
  return servers.map((server) => splitMCPServerSecrets(server).config);
}
