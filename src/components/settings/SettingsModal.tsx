import { useState, useEffect } from 'react'
import { useAppStore } from '../../stores'
import { X, Key, Globe, Cpu, Save, Eye, EyeOff, Server, Sparkles, Wifi, WifiOff, RefreshCw, ChevronUp, ChevronRight } from 'lucide-react'
import type { ProviderConfig } from '../../types'
import { MCPSettings } from '../mcp'
import { SkillSettings } from '../skills'
import { Kilo } from '../../utils'

interface SettingsModalProps {
  onClose: () => void
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const {
    activeProvider,
    setActiveProvider,
    providerConfigs,
    setProviderConfig,
    providerList,
    setProviderList,
    theme,
    setTheme,
  } = useAppStore()

  const [showKey, setShowKey] = useState(false)
  const [activeTab, setActiveTab] = useState<'provider' | 'mcp' | 'skills'>('provider')
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null)
  const [localConfigs, setLocalConfigs] = useState<Record<string, ProviderConfig>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [fetching, setFetching] = useState(false)

  // Load providers from Kilo on mount
  useEffect(() => {
    if (providerList.length > 0) return
    fetchProviders()
  }, [])

  const fetchProviders = async () => {
    setFetching(true)
    try {
      const list = await Kilo.listProviders()
      setProviderList(
        list.map((p) => ({
          id: p.id,
          name: p.name,
          env: Array.isArray(p.env) ? p.env[0] || '' : '',
          models: p.models || {},
          source: p.source || '',
        })),
      )
    } catch {
      // Kilo might not be running
    } finally {
      setFetching(false)
    }
  }

  // Sync local configs from store on open
  useEffect(() => {
    setLocalConfigs({ ...providerConfigs })
    setExpandedProvider(activeProvider || null)
  }, [activeProvider, providerConfigs])

  const handleConfigChange = (id: string, field: string, value: string) => {
    setLocalConfigs((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || { apiKey: '', model: '', baseUrl: '' }), [field]: value },
    }))
  }

  const handleSave = async () => {
    // Save locally
    for (const [id, cfg] of Object.entries(localConfigs)) {
      setProviderConfig(id, cfg)
    }
    setActiveProvider(expandedProvider || activeProvider)

    // Sync to Kilo backend
    setSaving(true)
    try {
      for (const [id, cfg] of Object.entries(localConfigs)) {
        if (cfg.apiKey) {
          await Kilo.setProviderApiKey(id, cfg.apiKey)
        }
      }
    } catch {
      // Kilo might not be running
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const provider = providerList.find((p) => p.id === expandedProvider)
  const cfg = expandedProvider ? localConfigs[expandedProvider] || { apiKey: '', model: '', baseUrl: '' } : null
  const modelKeys = provider ? Object.keys(provider.models || {}) : []
  const envVar = provider?.env || ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[80vh] bg-[var(--color-surface)] rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-xl font-bold">Settings</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--color-surface-dim)] transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-6 pt-4 border-b border-[var(--color-border)]">
          {[
            ['provider', 'Cpu', 'AI Provider'],
            ['mcp', 'Server', 'MCP Servers'],
            ['skills', 'Sparkles', 'Skills'],
          ].map(([tab, icon, label]) => (
            <button
              key={String(tab)}
              onClick={() => setActiveTab(String(tab) as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-lg transition-colors ${
                activeTab === tab
                  ? 'bg-[var(--color-surface-dim)] border-b-2 border-[var(--color-primary)]'
                  : 'hover:bg-[var(--color-surface-dim)]'
              }`}
            >
              {icon === 'Cpu' ? <Cpu size={16} /> : icon === 'Server' ? <Server size={16} /> : <Sparkles size={16} />}
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-160px)] space-y-4">
          {activeTab === 'provider' && (
            <>
              {/* Theme */}
              <section>
                <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">Appearance</h3>
                <div className="flex gap-2">
                  {(['light', 'dark'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTheme(t)}
                      className={`px-4 py-2 rounded-lg capitalize transition-colors ${
                        theme === t ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-surface-dim)] hover:bg-[var(--color-border)]'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </section>

              {/* Provider List */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                    Providers {providerList.length > 0 && `(${providerList.length})`}
                  </h3>
                  <button
                    onClick={fetchProviders}
                    disabled={fetching}
                    className="flex items-center gap-1 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                  >
                    <RefreshCw size={12} className={fetching ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                </div>

                {providerList.length === 0 ? (
                  <div className="text-center py-8 text-[var(--color-text-secondary)] border border-dashed border-[var(--color-border)] rounded-lg">
                    <Server size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">
                      {fetching ? 'Loading providers from Kilo...' : 'No providers loaded. Connect Kilo and click Refresh.'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1 max-h-64 overflow-y-auto border border-[var(--color-border)] rounded-lg">
                    {providerList.map((p) => {
                      const isActive = expandedProvider === p.id
                      const isConfigured = !!localConfigs[p.id]?.apiKey
                      return (
                        <div
                          key={p.id}
                          onClick={() => setExpandedProvider(isActive ? null : p.id)}
                          className={`flex items-center gap-3 p-3 cursor-pointer transition-colors border-b border-[var(--color-border)] last:border-b-0 ${
                            isActive
                              ? 'bg-[var(--color-primary)]/10 border-l-2 border-l-[var(--color-primary)]'
                              : 'hover:bg-[var(--color-surface-dim)]'
                          }`}
                        >
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            isActive ? 'bg-[var(--color-success)]' : isConfigured ? 'bg-yellow-500' : 'bg-gray-400'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{p.name}</span>
                              {p.source === 'config' && (
                                <span className="text-[10px] px-1.5 rounded bg-purple-500/10 text-purple-600">built-in</span>
                              )}
                            </div>
                            <p className="text-xs text-[var(--color-text-secondary)] truncate">
                              {envVar ? `Env: ${envVar}` : Object.keys(p.models || {}).length + ' models'}
                            </p>
                          </div>
                          {(isActive ? <ChevronUp size={16} /> : <ChevronRight size={16} />)}
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>

              {/* Provider Detail */}
              {expandedProvider && provider && cfg && (
                <section className="space-y-3 p-4 border border-[var(--color-border)] rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{provider.name}</span>
                    {provider.source === 'config' && (
                      <span className="text-[10px] px-1.5 rounded bg-purple-500/10 text-purple-600">built-in</span>
                    )}
                  </div>

                  {/* API Key + Env name */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <Key size={16} />
                      {envVar ? `API Key (${envVar})` : 'API Key'}
                    </label>
                    <div className="relative">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={cfg.apiKey}
                        onChange={(e) => handleConfigChange(expandedProvider, 'apiKey', e.target.value)}
                        placeholder="Paste your API key"
                        className="w-full px-4 py-2 pr-10 rounded-lg bg-[var(--color-surface-dim)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-primary)]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]"
                      >
                        {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  {/* Model */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <Cpu size={16} /> Model
                    </label>
                    {modelKeys.length > 0 ? (
                      <select
                        value={cfg.model}
                        onChange={(e) => handleConfigChange(expandedProvider, 'model', e.target.value)}
                        className="w-full px-4 py-2 rounded-lg bg-[var(--color-surface-dim)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-primary)]"
                      >
                        {modelKeys.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={cfg.model}
                        onChange={(e) => handleConfigChange(expandedProvider, 'model', e.target.value)}
                        placeholder="Model ID"
                        className="w-full px-4 py-2 rounded-lg bg-[var(--color-surface-dim)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-primary)]"
                      />
                    )}
                  </div>

                  {/* Base URL */}
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <Globe size={16} /> Base URL <span className="text-xs text-[var(--color-text-secondary)]">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={cfg.baseUrl || ''}
                      onChange={(e) => handleConfigChange(expandedProvider, 'baseUrl', e.target.value)}
                      placeholder="Custom endpoint"
                      className="w-full px-4 py-2 rounded-lg bg-[var(--color-surface-dim)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-primary)]"
                    />
                  </div>
                </section>
              )}
            </>
          )}

          {activeTab === 'mcp' && <MCPSettings />}
          {activeTab === 'skills' && <SkillSettings />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface-dim)]">
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
            {providerList.length > 0 ? <Wifi size={12} className="text-[var(--color-success)]" /> : <WifiOff size={12} className="text-[var(--color-error)]" />}
            {providerList.length > 0 ? 'Connected to Kilo' : 'Kilo not connected'}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 rounded-lg hover:bg-[var(--color-border)] transition-colors text-sm">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity text-sm"
            >
              {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
              {saved ? 'Saved' : saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
