import { describe, expect, it } from 'vitest';
import {
  redactMCPServersForPersistence,
  splitMCPServerSecrets,
} from '../src/utils/mcpConfigSecurity';

describe('MCP config secret separation', () => {
  it('removes remote headers and local env values from public config', () => {
    const result = splitMCPServerSecrets({
      name: 'private-server',
      type: 'http',
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer secret', 'X-Tenant': 'alpha' },
      env: { API_TOKEN: 'secret-env' },
    });

    expect(result.config.headers).toBeUndefined();
    expect(result.config.env).toBeUndefined();
    expect(result.config.auth?.type).toBe('bearer');
    expect(result.config.hasStoredSecrets).toBe(true);
    expect(result.secrets.headers?.Authorization).toBe('Bearer secret');
    expect(result.secrets.env?.API_TOKEN).toBe('secret-env');
  });

  it('defensively redacts every server before Zustand persistence', () => {
    const persisted = redactMCPServersForPersistence([{
      name: 'legacy',
      type: 'stdio',
      command: 'node',
      env: { PASSWORD: 'do-not-persist' },
    }]);

    expect(persisted[0].env).toBeUndefined();
    expect(JSON.stringify(persisted)).not.toContain('do-not-persist');
  });
});
