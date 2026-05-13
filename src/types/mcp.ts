export type MCPTransportType = 'stdio' | 'sse' | 'http';

export interface MCPServerConfig {
  name: string;
  type: MCPTransportType;
  command?: string;      // for stdio
  args?: string[];       // for stdio
  url?: string;          // for sse/http
  headers?: Record<string, string>;
  env?: Record<string, string>;
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
  status: 'connected' | 'connecting' | 'error' | 'disabled';
  error?: string;
  tools: MCPTool[];
  resources: MCPResource[];
}
