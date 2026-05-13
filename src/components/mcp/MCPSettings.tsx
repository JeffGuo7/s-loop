import { useState } from 'react';
import {
  Server,
  Plus,
  Trash2,
  RefreshCw,
  Power,
  PowerOff,
  ChevronDown,
  ChevronRight,
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">MCP Servers</h3>
        <div className="flex gap-2">
          <button
            onClick={handleRefreshAll}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh All
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Server
          </button>
        </div>
      </div>

      {servers.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <Server className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No MCP servers configured</p>
          <p className="text-sm">Add a server to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
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
    connected: 'bg-green-500',
    connecting: 'bg-yellow-500',
    error: 'bg-red-500',
    disabled: 'bg-gray-400',
  };

  const currentStatus = server.disabled ? 'disabled' : status?.status || 'disabled';

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 cursor-pointer"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )}
          <div className={`w-2 h-2 rounded-full ${statusColors[currentStatus]}`} />
          <span className="font-medium">{server.name}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">{server.type}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title={server.disabled ? 'Enable' : 'Disable'}
          >
            {server.disabled ? (
              <PowerOff className="w-4 h-4 text-gray-400" />
            ) : (
              <Power className="w-4 h-4 text-green-500" />
            )}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRefresh();
            }}
            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4 text-gray-500" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
            title="Remove"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
          <div className="text-sm">
            <span className="text-gray-500 dark:text-gray-400">Type: </span>
            <span className="font-mono">{server.type}</span>
          </div>

          {server.type === 'stdio' && server.command && (
            <div className="text-sm">
              <span className="text-gray-500 dark:text-gray-400">Command: </span>
              <span className="font-mono">
                {server.command} {server.args?.join(' ')}
              </span>
            </div>
          )}

          {server.type !== 'stdio' && server.url && (
            <div className="text-sm">
              <span className="text-gray-500 dark:text-gray-400">URL: </span>
              <span className="font-mono">{server.url}</span>
            </div>
          )}

          {status?.error && (
            <div className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 p-2 rounded">
              {status.error}
            </div>
          )}

          {status?.tools && status.tools.length > 0 && (
            <div>
              <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 mb-1">
                <Wrench className="w-3 h-3" />
                Tools ({status.tools.length})
              </div>
              <div className="flex flex-wrap gap-1">
                {status.tools.map((tool, i) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded"
                  >
                    {tool.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {status?.resources && status.resources.length > 0 && (
            <div>
              <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 mb-1">
                <FileText className="w-3 h-3" />
                Resources ({status.resources.length})
              </div>
              <div className="flex flex-wrap gap-1">
                {status.resources.map((resource, i) => (
                  <span
                    key={i}
                    className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded"
                  >
                    {resource.name}
                  </span>
                ))}
              </div>
            </div>
          )}
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">Add MCP Server</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
              placeholder="my-server"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Transport Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as MCPTransportType)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
            >
              <option value="stdio">stdio</option>
              <option value="sse">sse</option>
              <option value="http">http</option>
            </select>
          </div>

          {type === 'stdio' ? (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Command</label>
                <input
                  type="text"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                  placeholder="npx"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Arguments</label>
                <input
                  type="text"
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                  placeholder="-y @modelcontextprotocol/server-filesystem ."
                />
              </div>
            </>
          ) : (
            <div>
              <label className="block text-sm font-medium mb-1">URL</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                placeholder="http://localhost:3000/mcp"
                required
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              Add Server
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
