import { useState } from 'react';
import {
  Server,
  Plus,
  Trash2,
  RefreshCw,
  Power,
  PowerOff,
  ChevronDown,
  Wrench,
  FileText,
} from 'lucide-react';
import { useMCPStore } from '../../stores';
import type { MCPServerConfig, MCPTransportType, MCPTool, MCPResource } from '../../types/mcp';

export function MCPSettings() {
  const { servers, serverStatuses, removeServer, toggleServer, refreshServer, refreshAllServers } =
    useMCPStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);

  const handleRefreshAll = async () => {
    await refreshAllServers();
  };

  return (
    <div className="space-y-8 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">MCP Servers</h3>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Connect to external context via Model Context Protocol.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleRefreshAll}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Sync All
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Server
          </button>
        </div>
      </div>

      {servers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-4 border-2 border-dashed border-[var(--color-border)] rounded-[var(--radius-lg)] bg-[var(--color-surface-secondary)]/50">
          <div className="w-16 h-16 bg-[var(--color-accent-muted)] rounded-full flex items-center justify-center mb-4">
            <Server className="w-8 h-8 text-[var(--color-accent)] opacity-80" />
          </div>
          <h4 className="text-lg font-semibold text-[var(--color-text)]">No servers found</h4>
          <p className="text-sm text-[var(--color-text-secondary)] text-center max-w-xs mt-2">
            Add your first MCP server to extend AI knowledge with local files, databases, or APIs.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {servers.map((server) => (
            <MCPServerCard
              key={server.name}
              server={server}
              status={serverStatuses[server.name]}
              expanded={expandedServer === server.name}
              onToggleExpand={() =>
                setExpandedServer(expandedServer === server.name ? null : server.name)
              }
              onToggle={() => toggleServer(server.name)}
              onRemove={() => removeServer(server.name)}
              onRefresh={() => refreshServer(server.name)}
            />
          ))}
        </div>
      )}

      {showAddModal && <AddMCPServerModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
}

interface MCPServerCardProps {
  server: MCPServerConfig;
  status?: { status: string; error?: string; tools: MCPTool[]; resources: MCPResource[] };
  expanded: boolean;
  onToggleExpand: () => void;
  onToggle: () => void;
  onRemove: () => void;
  onRefresh: () => void;
}

function MCPServerCard({
  server,
  status,
  expanded,
  onToggleExpand,
  onToggle,
  onRemove,
  onRefresh,
}: MCPServerCardProps) {
  const statusColors: Record<string, string> = {
    connected: 'bg-[var(--color-success)]',
    connecting: 'bg-yellow-500 animate-pulse',
    error: 'bg-[var(--color-error)]',
    disabled: 'bg-[var(--color-text-tertiary)]',
  };

  const currentStatus = server.disabled ? 'disabled' : status?.status || 'disabled';

  return (
    <div className={`group transition-all duration-300 border ${
      expanded 
        ? 'border-[var(--color-accent)] shadow-md' 
        : 'border-[var(--color-border)] hover:border-[var(--color-accent-light)]'
    } rounded-[var(--radius-md)] overflow-hidden bg-[var(--color-surface)]`}>
      <div
        className={`flex items-center justify-between p-4 cursor-pointer transition-colors ${
          expanded ? 'bg-[var(--color-accent-muted)]' : 'hover:bg-[var(--color-surface-secondary)]'
        }`}
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className={`p-2.5 rounded-xl transition-colors ${
            currentStatus === 'connected' ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-surface-secondary)] text-[var(--color-text-tertiary)]'
          }`}>
            <Server className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[var(--color-text)] truncate">{server.name}</span>
              <div className={`w-2 h-2 rounded-full ${statusColors[currentStatus]}`} />
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] truncate mt-0.5 uppercase tracking-wider font-bold opacity-60">
              {server.type} Protocol
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              !server.disabled 
                ? 'bg-[var(--color-success)]/10 text-[var(--color-success)] hover:bg-[var(--color-success)]/20' 
                : 'bg-[var(--color-surface-secondary)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)]'
            }`}
          >
            {!server.disabled ? (
              <><Power className="w-3.5 h-3.5" /> Online</>
            ) : (
              <><PowerOff className="w-3.5 h-3.5" /> Offline</>
            )}
          </button>

          <div className="w-[1px] h-6 bg-[var(--color-border)] mx-1" />

          <button
            onClick={(e) => {
              e.stopPropagation();
              onRefresh();
            }}
            className="p-2 text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)] rounded-lg transition-all"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="p-2 text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] hover:bg-[var(--color-error-bg)] rounded-lg transition-all"
            title="Remove"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          
          <div className={`transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}>
            <ChevronDown className="w-4 h-4 text-[var(--color-text-tertiary)]" />
          </div>
        </div>
      </div>

      {expanded && (
        <div className="p-6 border-t border-[var(--color-border)] bg-[var(--color-surface)] animate-slide-up space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-1.5 block">
                  Configuration
                </label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-mono text-[var(--color-text-secondary)] bg-[var(--color-surface-secondary)] p-3 rounded-xl border border-[var(--color-border)]">
                    <span className="text-[var(--color-accent)] opacity-50 font-bold">TYPE</span>
                    {server.type}
                  </div>
                  {server.type === 'stdio' ? (
                    <div className="flex flex-col gap-1 p-3 bg-[var(--color-surface-secondary)] rounded-xl border border-[var(--color-border)]">
                       <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] opacity-50">Command</span>
                       <code className="text-xs font-mono text-[var(--color-text)] break-all">
                        {server.command} {server.args?.join(' ')}
                       </code>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1 p-3 bg-[var(--color-surface-secondary)] rounded-xl border border-[var(--color-border)]">
                       <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] opacity-50">URL</span>
                       <code className="text-xs font-mono text-[var(--color-text)] break-all">{server.url}</code>
                    </div>
                  )}
                </div>
              </div>

              {status?.error && (
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-error)] mb-1.5 block">
                    Connection Error
                  </label>
                  <div className="text-xs font-mono p-3 bg-[var(--color-error-bg)] border border-[var(--color-error)]/20 text-[var(--color-error)] rounded-xl">
                    {status.error}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {status?.tools && status.tools.length > 0 && (
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-2 block">
                    Available Tools ({status.tools.length})
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {status.tools.map((tool, i) => (
                      <span
                        key={i}
                        className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 bg-[var(--color-surface-secondary)] text-[var(--color-text)] border border-[var(--color-border)] rounded-lg font-bold shadow-sm"
                      >
                        <Wrench size={10} className="text-[var(--color-accent)]" />
                        {tool.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {status?.resources && status.resources.length > 0 && (
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-2 block">
                    Resources ({status.resources.length})
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {status.resources.map((resource, i) => (
                      <span
                        key={i}
                        className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 bg-[var(--color-surface-secondary)] text-[var(--color-text)] border border-[var(--color-border)] rounded-lg font-bold shadow-sm"
                      >
                        <FileText size={10} className="text-[var(--color-success)]" />
                        {resource.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface AddMCPServerModalProps {
  onClose: () => void;
}

function AddMCPServerModal({ onClose }: AddMCPServerModalProps) {
  const { addServer } = useMCPStore();
  const [name, setName] = useState('');
  const [type, setType] = useState<MCPTransportType>('stdio');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const config: MCPServerConfig = {
      name,
      type,
      ...(type === 'stdio'
        ? { command, args: args.split(' ').filter(Boolean) }
        : { url }),
    };

    addServer(config);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-2xl w-full max-w-lg overflow-hidden animate-slide-up">
        <div className="px-8 pt-8 pb-6">
          <h3 className="text-2xl font-bold text-[var(--color-text)]">New MCP Server</h3>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">Connect external tools and context.</p>
        </div>

        <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] ml-1">Server Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-[var(--color-surface-secondary)] border border-[var(--color-border)] rounded-xl focus:ring-2 focus:ring-[var(--color-accent)] outline-none text-sm transition-all"
              placeholder="e.g., filesystem-server"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] ml-1">Transport Protocol</label>
            <div className="relative">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as MCPTransportType)}
                className="w-full px-4 py-3 bg-[var(--color-surface-secondary)] border border-[var(--color-border)] rounded-xl focus:ring-2 focus:ring-[var(--color-accent)] outline-none text-sm font-bold appearance-none cursor-pointer pr-10"
              >
                <option value="stdio">stdio (Local Command)</option>
                <option value="sse">sse (Server-Sent Events)</option>
                <option value="http">http (Standard HTTP)</option>
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--color-text-tertiary)]">
                <ChevronDown size={16} />
              </div>
            </div>
          </div>

          {type === 'stdio' ? (
            <div className="grid grid-cols-1 gap-4 animate-slide-up">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] ml-1">Executable Command</label>
                <input
                  type="text"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  className="w-full px-4 py-3 bg-[var(--color-surface-secondary)] border border-[var(--color-border)] rounded-xl focus:ring-2 focus:ring-[var(--color-accent)] outline-none text-sm font-mono"
                  placeholder="npx, python, etc."
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] ml-1">Arguments</label>
                <input
                  type="text"
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  className="w-full px-4 py-3 bg-[var(--color-surface-secondary)] border border-[var(--color-border)] rounded-xl focus:ring-2 focus:ring-[var(--color-accent)] outline-none text-sm font-mono"
                  placeholder="-y @modelcontextprotocol/server-filesystem ."
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5 animate-slide-up">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] ml-1">Server URL</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full px-4 py-3 bg-[var(--color-surface-secondary)] border border-[var(--color-border)] rounded-xl focus:ring-2 focus:ring-[var(--color-accent)] outline-none text-sm font-mono"
                placeholder="http://localhost:3000/mcp"
                required
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary px-8"
            >
              Connect Server
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
