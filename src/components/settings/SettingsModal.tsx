import { useState, useEffect } from 'react'
import { useAppStore } from '../../stores'
import { X, Cpu, Save, Eye, EyeOff, Server, Sparkles, RefreshCw, ChevronRight, ChevronDown, Sun, Moon, CheckCircle } from 'lucide-react'
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-5xl h-[85vh] bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-2xl overflow-hidden flex animate-slide-up border border-[var(--color-border)]">
        
        {/* Settings Sidebar */}
        <aside className="w-64 bg-[var(--color-surface-secondary)] border-r border-[var(--color-border)] flex flex-col">
          <div className="p-8">
            <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Settings</h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] mt-2">Configuration</p>
          </div>

          <nav className="flex-1 px-4 space-y-1">
            {[
              { id: 'provider', icon: Cpu, label: 'AI Providers' },
              { id: 'mcp', icon: Server, label: 'MCP Servers' },
              { id: 'skills', icon: Sparkles, label: 'Skills' },
            ].map((item: any) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                  activeTab === item.id
                    ? 'bg-[var(--color-accent)] text-white shadow-lg shadow-[var(--color-accent)]/20'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]'
                }`}
              >
                <item.icon size={18} strokeWidth={activeTab === item.id ? 3 : 2} />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="p-6">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm">
              <div className={`w-2 h-2 rounded-full ${providerList.length > 0 ? 'bg-[var(--color-success)] animate-pulse' : 'bg-[var(--color-error)]'}`} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
                {providerList.length > 0 ? 'Kilo Online' : 'Kilo Offline'}
              </span>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-[var(--color-surface)]">
          {/* Header */}
          <header className="h-20 flex items-center justify-between px-10 border-b border-[var(--color-border)] shrink-0">
            <div>
              <h3 className="text-lg font-bold text-[var(--color-text)]">
                {activeTab === 'provider' && 'AI Provider Configuration'}
                {activeTab === 'mcp' && 'Model Context Protocol'}
                {activeTab === 'skills' && 'Skill Management'}
              </h3>
            </div>
            <button 
              onClick={onClose} 
              className="p-2 rounded-xl hover:bg-[var(--color-surface-secondary)] text-[var(--color-text-tertiary)] transition-all"
            >
              <X size={20} />
            </button>
          </header>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-10 scrollbar-subtle">
            {activeTab === 'provider' && (
              <div className="max-w-3xl space-y-10 animate-slide-up">
                {/* Theme Selection */}
                <section>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-4 block">
                    Interface Theme
                  </label>
                  <div className="flex p-1.5 bg-[var(--color-surface-secondary)] rounded-2xl w-fit border border-[var(--color-border)]">
                    {(['light', 'dark'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTheme(t)}
                        className={`flex items-center gap-3 px-8 py-2.5 rounded-xl text-sm font-bold transition-all ${
                          theme === t 
                            ? 'bg-[var(--color-surface)] text-[var(--color-accent)] shadow-md shadow-black/5' 
                            : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
                        }`}
                      >
                        {t === 'light' ? <Sun size={16} /> : <Moon size={16} />}
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                </section>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                  {/* Left Column: Provider List */}
                  <section className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">
                        Providers ({providerList.length})
                      </label>
                      <button
                        onClick={fetchProviders}
                        disabled={fetching}
                        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-accent)] hover:opacity-80 disabled:opacity-50"
                      >
                        <RefreshCw size={12} className={fetching ? 'animate-spin' : ''} strokeWidth={3} />
                        Sync
                      </button>
                    </div>

                    <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-subtle pr-2">
                      {providerList.map((p) => {
                        const isActive = expandedProvider === p.id
                        const isConfigured = !!localConfigs[p.id]?.apiKey
                        return (
                          <button
                            key={p.id}
                            onClick={() => setExpandedProvider(isActive ? null : p.id)}
                            className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left ${
                              isActive
                                ? 'bg-[var(--color-accent-muted)] border-[var(--color-accent)]'
                                : 'bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-accent-light)]'
                            }`}
                          >
                            <div className={`p-2 rounded-xl transition-colors ${
                              isActive ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-surface-secondary)] text-[var(--color-text-tertiary)]'
                            }`}>
                              <Cpu size={18} strokeWidth={isActive ? 2.5 : 2} />
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-bold ${isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]'}`}>
                                  {p.name}
                                </span>
                                {isConfigured && !isActive && (
                                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />
                                )}
                              </div>
                              <p className="text-[10px] text-[var(--color-text-tertiary)] truncate font-mono mt-0.5">
                                {Object.keys(p.models || {}).length} Models
                              </p>
                            </div>
                            <ChevronRight size={16} className={`text-[var(--color-text-tertiary)] transition-transform duration-300 ${isActive ? 'rotate-90 text-[var(--color-accent)]' : ''}`} />
                          </button>
                        )
                      })}
                    </div>
                  </section>

                  {/* Right Column: Provider Config */}
                  <section className="space-y-4">
                    {expandedProvider && provider && cfg ? (
                      <div className="p-8 bg-[var(--color-surface-secondary)] rounded-[var(--radius-lg)] border border-[var(--color-border)] animate-slide-up space-y-6">
                        <div className="flex items-center gap-3 pb-4 border-b border-[var(--color-border)]">
                          <div className="w-1.5 h-6 bg-[var(--color-accent)] rounded-full" />
                          <span className="text-base font-bold text-[var(--color-text)]">{provider.name}</span>
                        </div>

                        <div className="space-y-5">
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] ml-1">
                              API Key {envVar && <span className="text-[var(--color-accent)] opacity-70">({envVar})</span>}
                            </label>
                            <div className="relative">
                              <input
                                type={showKey ? 'text' : 'password'}
                                value={cfg.apiKey}
                                onChange={(e) => handleConfigChange(expandedProvider, 'apiKey', e.target.value)}
                                placeholder="sk-..."
                                className="w-full px-5 py-3.5 pr-14 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] focus:ring-2 focus:ring-[var(--color-accent)] outline-none text-sm font-mono transition-all"
                              />
                              <button
                                type="button"
                                onClick={() => setShowKey(!showKey)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] transition-colors"
                              >
                                {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                              </button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] ml-1">Default Model</label>
                            <div className="relative">
                              {modelKeys.length > 0 ? (
                                <select
                                  value={cfg.model}
                                  onChange={(e) => handleConfigChange(expandedProvider, 'model', e.target.value)}
                                  className="w-full px-5 py-3.5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] focus:ring-2 focus:ring-[var(--color-accent)] outline-none text-sm font-bold appearance-none cursor-pointer pr-10"
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
                                  placeholder="e.g., gpt-4-turbo"
                                  className="w-full px-5 py-3.5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] focus:ring-2 focus:ring-[var(--color-accent)] outline-none text-sm font-bold"
                                />
                              )}
                              {modelKeys.length > 0 && (
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--color-text-tertiary)]">
                                  <ChevronDown size={16} />
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] ml-1">Endpoint Proxy</label>
                            <input
                              type="text"
                              value={cfg.baseUrl || ''}
                              onChange={(e) => handleConfigChange(expandedProvider, 'baseUrl', e.target.value)}
                              placeholder="https://api.openai.com/v1"
                              className="w-full px-5 py-3.5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] focus:ring-2 focus:ring-[var(--color-accent)] outline-none text-sm font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-[var(--color-surface-secondary)]/50 rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--color-border)]">
                        <Cpu size={48} className="text-[var(--color-text-tertiary)] opacity-20 mb-4" />
                        <h4 className="text-sm font-bold text-[var(--color-text-secondary)]">No Provider Selected</h4>
                        <p className="text-xs text-[var(--color-text-tertiary)] mt-2">Select a provider from the list to configure its API settings.</p>
                      </div>
                    )}
                  </section>
                </div>
              </div>
            )}

            {activeTab === 'mcp' && <MCPSettings />}
            {activeTab === 'skills' && <SkillSettings />}
          </div>

          {/* Action Footer */}
          <footer className="h-24 px-10 border-t border-[var(--color-border)] bg-[var(--color-surface-secondary)]/30 flex items-center justify-end gap-4 shrink-0">
            <button 
              onClick={onClose} 
              className="px-8 py-3 text-sm font-bold text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`flex items-center gap-3 px-10 py-3 rounded-2xl font-bold text-sm transition-all ${
                saved 
                  ? 'bg-[var(--color-success)] text-white' 
                  : 'bg-[var(--color-accent)] text-white shadow-md shadow-[var(--color-accent)]/20'
              } disabled:opacity-50`}
            >
              {saving ? <RefreshCw size={18} className="animate-spin" /> : saved ? <CheckCircle size={18} /> : <Save size={18} />}
              {saved ? 'Settings Saved' : saving ? 'Syncing...' : 'Apply Changes'}
            </button>
          </footer>
        </div>
      </div>
    </div>
  )
}
