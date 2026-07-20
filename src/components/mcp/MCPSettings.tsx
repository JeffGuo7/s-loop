import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  Code,
  FileCode,
} from 'lucide-react';
import { useMCPStore } from '../../stores';
import type { MCPServerConfig, MCPTransportType, MCPTool, MCPResource } from '../../types/mcp';

export function MCPSettings() {
  const { t } = useTranslation();
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
          <h3 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">{t('mcp.title')}</h3>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            {t('mcp.description')}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleRefreshAll}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            {t('mcp.syncAll')}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            {t('mcp.addServer')}
          </button>
        </div>
      </div>

      {servers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-4 border-2 border-dashed border-[var(--color-border)] rounded-[var(--radius-lg)] bg-[var(--color-surface-secondary)]/50">
          <div className="w-16 h-16 bg-[var(--color-accent-muted)] rounded-full flex items-center justify-center mb-4">
            <Server className="w-8 h-8 text-[var(--color-accent)] opacity-80" />
          </div>
          <h4 className="text-lg font-semibold text-[var(--color-text)]">{t('mcp.emptyTitle')}</h4>
          <p className="text-sm text-[var(--color-text-secondary)] text-center max-w-xs mt-2">
            {t('mcp.emptyDesc')}
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
  const { t } = useTranslation();
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
              {server.type} {t('mcp.protocol')}
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
              <><Power className="w-3.5 h-3.5" /> {t('mcp.online')}</>
            ) : (
              <><PowerOff className="w-3.5 h-3.5" /> {t('mcp.offline')}</>
            )}
          </button>

          <div className="w-[1px] h-6 bg-[var(--color-border)] mx-1" />

          <button
            onClick={(e) => {
              e.stopPropagation();
              onRefresh();
            }}
            className="p-2 text-[var(--color-text-tertiary)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)] rounded-lg transition-all"
            title={t('mcp.refresh')}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="p-2 text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] hover:bg-[var(--color-error-bg)] rounded-lg transition-all"
            title={t('mcp.remove')}
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
                  {t('mcp.configuration')}
                </label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-mono text-[var(--color-text-secondary)] bg-[var(--color-surface-secondary)] p-3 rounded-xl border border-[var(--color-border)]">
                    <span className="text-[var(--color-accent)] opacity-50 font-bold">{t('mcp.type')}</span>
                    {server.type}
                  </div>
                  {server.type === 'stdio' ? (
                    <div className="flex flex-col gap-1 p-3 bg-[var(--color-surface-secondary)] rounded-xl border border-[var(--color-border)]">
                       <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] opacity-50">{t('mcp.command')}</span>
                       <code className="text-xs font-mono text-[var(--color-text)] break-all">
                        {server.command} {server.args?.join(' ')}
                       </code>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1 p-3 bg-[var(--color-surface-secondary)] rounded-xl border border-[var(--color-border)]">
                       <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] opacity-50">{t('mcp.url')}</span>
                       <code className="text-xs font-mono text-[var(--color-text)] break-all">{server.url}</code>
                    </div>
                  )}
                </div>
              </div>

              {status?.error && (
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-error)] mb-1.5 block">
                    {t('mcp.connectionError')}
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
                    {t('mcp.availableTools', { count: status.tools.length })}
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
                    {t('mcp.resources', { count: status.resources.length })}
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

function parseJSONConfig(data: unknown): MCPServerConfig[] {
  const results: MCPServerConfig[] = [];

  if (!data || typeof data !== 'object') return results;

  const obj = data as Record<string, unknown>;

  // Format 1: { mcpServers: { name: { type, command, args, ... } } }
  if (obj.mcpServers && typeof obj.mcpServers === 'object' && !Array.isArray(obj.mcpServers)) {
    for (const [name, cfg] of Object.entries(obj.mcpServers)) {
      if (cfg && typeof cfg === 'object') {
        const server = cfg as Record<string, unknown>;
        results.push({
          name,
          type: (server.type as MCPTransportType) || 'stdio',
          command: server.command as string | undefined,
          args: server.args as string[] | undefined,
          url: server.url as string | undefined,
          headers: server.headers as Record<string, string> | undefined,
          env: server.env as Record<string, string> | undefined,
          disabled: false,
        });
      }
    }
    return results;
  }

  // Format 2: Array of server configs
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item && typeof item === 'object') {
        const server = item as Record<string, unknown>;
        results.push({
          name: (server.name as string) || 'unnamed',
          type: (server.type as MCPTransportType) || 'stdio',
          command: server.command as string | undefined,
          args: server.args as string[] | undefined,
          url: server.url as string | undefined,
          env: server.env as Record<string, string> | undefined,
          disabled: false,
        });
      }
    }
    return results;
  }

  // Format 3: Single object with name
  if (obj.name) {
    results.push({
      name: obj.name as string,
      type: (obj.type as MCPTransportType) || 'stdio',
      command: obj.command as string | undefined,
      args: obj.args as string[] | undefined,
      url: obj.url as string | undefined,
      env: obj.env as Record<string, string> | undefined,
      disabled: false,
    });
  }

  return results;
}

interface AddMCPServerModalProps {
  onClose: () => void;
}

function AddMCPServerModal({ onClose }: AddMCPServerModalProps) {
  const { t } = useTranslation();
  const { addServer } = useMCPStore();
  const [name, setName] = useState('');
  const [type, setType] = useState<MCPTransportType>('stdio');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState('');
  const [inputMode, setInputMode] = useState<'form' | 'json'>('form');
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (inputMode === 'json') {
      try {
        const parsed = JSON.parse(jsonText);
        const configs = parseJSONConfig(parsed);
        if (configs.length === 0) {
          setJsonError(t('mcp.jsonParseError'));
          return;
        }
        for (const config of configs) {
          addServer(config);
        }
        onClose();
      } catch (err) {
        setJsonError(err instanceof Error ? err.message : t('mcp.invalidJson'));
      }
      return;
    }

    const config: MCPServerConfig = {
      name,
      type,
      ...(type === 'stdio'
        ? { command, args: args.split(' ').filter(Boolean) }
        : { url, ...(headers.trim() ? { headers: parseHeaders(headers) } : {}) }),
    };

    addServer(config);
    onClose();
  };

  const parseHeaders = (h: string): Record<string, string> => {
    const result: Record<string, string> = {};
    for (const line of h.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx > 0) {
        const key = trimmed.slice(0, colonIdx).trim();
        const value = trimmed.slice(colonIdx + 1).trim();
        if (key) result[key] = value;
      }
    }
    return result;
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-2xl w-full max-w-lg overflow-hidden animate-slide-up">
        <div className="px-8 pt-8 pb-6">
          <h3 className="text-2xl font-bold text-[var(--color-text)]">{t('mcp.newServer')}</h3>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">{t('mcp.newServerDesc')}</p>
        </div>

        <form onSubmit={handleSubmit} className="px-8 pb-8">
          <div className="flex gap-1 p-1 bg-[var(--color-surface-secondary)] rounded-xl mb-4">
            <button
              type="button"
              onClick={() => setInputMode('form')}
              className={`flex-1 py-2 px-4 text-xs font-bold rounded-lg transition-all ${
                inputMode === 'form'
                  ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text)]'
              }`}
            >
              <Code className="w-3.5 h-3.5 inline mr-1.5" />
              {t('mcp.formMode')}
            </button>
            <button
              type="button"
              onClick={() => setInputMode('json')}
              className={`flex-1 py-2 px-4 text-xs font-bold rounded-lg transition-all ${
                inputMode === 'json'
                  ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm'
                  : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text)]'
              }`}
            >
              <FileCode className="w-3.5 h-3.5 inline mr-1.5" />
              {t('mcp.jsonMode')}
            </button>
          </div>

          {inputMode === 'json' ? (
            <div className="space-y-3">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] ml-1">
                {t('mcp.jsonConfig')}
              </label>
              <textarea
                value={jsonText}
                onChange={(e) => {
                  setJsonText(e.target.value);
                  setJsonError(null);
                }}
                className="w-full px-4 py-3 bg-[var(--color-surface-secondary)] border border-[var(--color-border)] rounded-xl focus:ring-2 focus:ring-[var(--color-accent)] outline-none text-sm font-mono leading-relaxed"
                rows={10}
                placeholder={t('mcp.jsonPlaceholder')}
              />
              {jsonError && (
                <p className="text-xs text-[var(--color-error)] flex items-center gap-1">
                  <span>⚠</span> {jsonError}
                </p>
              )}
              <p className="text-[10px] text-[var(--color-text-tertiary)] opacity-60 leading-relaxed">
                {t('mcp.jsonHint')}
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] ml-1">{t('mcp.serverName')}</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 bg-[var(--color-surface-secondary)] border border-[var(--color-border)] rounded-xl focus:ring-2 focus:ring-[var(--color-accent)] outline-none text-sm transition-all"
                  placeholder={t('mcp.serverPlaceholder')}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] ml-1">{t('mcp.transportProtocol')}</label>
                <div className="relative">
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as MCPTransportType)}
                    className="w-full px-4 py-3 bg-[var(--color-surface-secondary)] border border-[var(--color-border)] rounded-xl focus:ring-2 focus:ring-[var(--color-accent)] outline-none text-sm font-bold appearance-none cursor-pointer pr-10"
                  >
                    <option value="stdio">{t('mcp.stdio')}</option>
                    <option value="sse">{t('mcp.sse')}</option>
                    <option value="http">{t('mcp.http')}</option>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--color-text-tertiary)]">
                    <ChevronDown size={16} />
                  </div>
                </div>
              </div>

              {type === 'stdio' ? (
                <div className="grid grid-cols-1 gap-4 animate-slide-up">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] ml-1">{t('mcp.executableCommand')}</label>
                    <input
                      type="text"
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      className="w-full px-4 py-3 bg-[var(--color-surface-secondary)] border border-[var(--color-border)] rounded-xl focus:ring-2 focus:ring-[var(--color-accent)] outline-none text-sm font-mono"
                      placeholder={t('mcp.commandPlaceholder')}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] ml-1">{t('mcp.arguments')}</label>
                    <input
                      type="text"
                      value={args}
                      onChange={(e) => setArgs(e.target.value)}
                      className="w-full px-4 py-3 bg-[var(--color-surface-secondary)] border border-[var(--color-border)] rounded-xl focus:ring-2 focus:ring-[var(--color-accent)] outline-none text-sm font-mono"
                      placeholder={t('mcp.argsPlaceholder')}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4 animate-slide-up">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] ml-1">{t('mcp.serverUrl')}</label>
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      className="w-full px-4 py-3 bg-[var(--color-surface-secondary)] border border-[var(--color-border)] rounded-xl focus:ring-2 focus:ring-[var(--color-accent)] outline-none text-sm font-mono"
                      placeholder={t('mcp.urlPlaceholder')}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] ml-1">Headers (optional)</label>
                    <textarea
                      value={headers}
                      onChange={(e) => setHeaders(e.target.value)}
                      className="w-full px-4 py-3 bg-[var(--color-surface-secondary)] border border-[var(--color-border)] rounded-xl focus:ring-2 focus:ring-[var(--color-accent)] outline-none text-sm font-mono"
                      placeholder={"Authorization: Bearer xxx\nX-Custom: value"}
                      rows={3}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
            >
              {t('mcp.cancel')}
            </button>
            <button
              type="submit"
              className="btn-primary px-8"
            >
              {t('mcp.connectServer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
