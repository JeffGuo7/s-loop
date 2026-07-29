export type MCPTransportType = 'stdio' | 'sse' | 'http';
export type MCPAuthType = 'none' | 'bearer' | 'oauth';

export interface MCPAuthConfig {
  type: MCPAuthType;
  clientId?: string;
  scopes?: string[];
}

export interface MCPToolFilter {
  allow?: string[];
  deny?: string[];
}

export interface MCPServerConfig {
  name: string;
  type: MCPTransportType;
  command?: string;      // for stdio
  args?: string[];       // for stdio
  url?: string;          // for sse/http
  headers?: Record<string, string>;
  env?: Record<string, string>;
  auth?: MCPAuthConfig;
  toolFilter?: MCPToolFilter;
  hasStoredSecrets?: boolean;
  disabled?: boolean;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPResource {
  name: string;
  uri: string;
  description?: string;
  mimeType?: string;
}

export interface MCPServerStatus {
  name: string;
  status: 'connected' | 'connecting' | 'auth-required' | 'error' | 'disabled';
  error?: string;
  authorizationUrl?: string;
  transport?: 'streamable-http' | 'sse';
  tools: MCPTool[];
  resources: MCPResource[];
}
