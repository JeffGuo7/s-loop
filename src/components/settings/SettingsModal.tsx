import { useState, useEffect, useMemo } from 'react'
import { useAppStore } from '../../stores'
import { X, Cpu, Save, Eye, EyeOff, Server, Sparkles, RefreshCw, Search, CheckCircle, ChevronRight, Check, Sun, Moon } from 'lucide-react'
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
  const [activeTab, setActiveTab] = useState<'provider' | 'mcp' | 'skills' | 'appearance'>('provider')
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null)
  const [localConfigs, setLocalConfigs] = useState<Record<string, ProviderConfig>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

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

  const filteredProviders = useMemo(() => {
    if (!searchQuery) return providerList
    const q = searchQuery.toLowerCase()
    return providerList.filter(p => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
  }, [providerList, searchQuery])

  const provider = providerList.find((p) => p.id === expandedProvider)
  const cfg = expandedProvider ? localConfigs[expandedProvider] || { apiKey: '', model: '', baseUrl: '' } : null
  const modelKeys = provider ? Object.keys(provider.models || {}) : []
  const envVar = provider?.env || ''

  return (
    <div className="modal-overlay p-4 sm:p-6 lg:p-8">
      <div className="modal-content w-full max-w-5xl h-[85vh] flex flex-row overflow-hidden bg-(--color-bg)">
        
        {/* Settings Sidebar */}
        <aside className="w-64 bg-(--color-surface) border-r border-(--color-border) flex flex-col shrink-0">
          <div className="p-6 pb-4">
            <h2 className="text-lg font-bold text-(--color-text)">Settings</h2>
          </div>

          <nav className="flex-1 px-3 space-y-1 overflow-y-auto scrollbar-subtle">
            {[
              { id: 'provider', icon: Cpu, label: 'AI Providers' },
              { id: 'mcp', icon: Server, label: 'MCP Servers' },
              { id: 'skills', icon: Sparkles, label: 'Skills' },
              { id: 'appearance', icon: theme === 'light' ? Sun : Moon, label: 'Appearance' },
            ].map((item: any) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeTab === item.id
                    ? 'bg-(--color-accent-muted) text-(--color-accent)'
                    : 'text-(--color-text-secondary) hover:bg-(--color-surface-secondary) hover:text-(--color-text)'
                }`}
              >
                <item.icon size={16} strokeWidth={activeTab === item.id ? 2.5 : 2} />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="p-4 border-t border-(--color-border-light)">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-(--color-surface-secondary)">
              <div className={`w-2 h-2 rounded-full ${providerList.length > 0 ? 'bg-(--color-success) animate-pulse' : 'bg-(--color-error)'}`} />
              <span className="text-xs font-medium text-(--color-text-secondary)">
                {providerList.length > 0 ? 'Kilo Online' : 'Kilo Offline'}
              </span>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-(--color-bg) relative">
          {/* Header */}
          <header className="h-16 flex items-center justify-between px-8 shrink-0 bg-(--color-surface)/50 backdrop-blur-sm border-b border-(--color-border-light) z-10">
            <h3 className="text-base font-bold text-(--color-text)">
              {activeTab === 'provider' && 'AI Providers'}
              {activeTab === 'mcp' && 'MCP Servers'}
              {activeTab === 'skills' && 'Skills'}
              {activeTab === 'appearance' && 'Appearance'}
            </h3>
            <button 
              onClick={onClose} 
              className="p-2 rounded-full hover:bg-(--color-surface-hover) text-(--color-text-tertiary) transition-colors"
            >
              <X size={18} />
            </button>
          </header>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto scrollbar-subtle">
            {activeTab === 'provider' && (
              <div className="flex flex-col lg:flex-row h-full">
                {/* Provider List */}
                <div className="w-full lg:w-[35%] border-r border-(--color-border-light) flex flex-col bg-(--color-surface) shrink-0">
                  <div className="p-4 border-b border-(--color-border-light) space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-(--color-text-secondary)">
                        {providerList.length} Available
                      </span>
                      <button
                        onClick={fetchProviders}
                        disabled={fetching}
                        className="text-xs font-medium text-(--color-accent) hover:opacity-80 disabled:opacity-50 flex items-center gap-1"
                      >
                        <RefreshCw size={12} className={fetching ? 'animate-spin' : ''} />
                        Sync
                      </button>
                    </div>
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-(--color-text-tertiary)" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search providers..."
                        className="w-full pl-9 pr-3 py-2 rounded-lg bg-(--color-surface-secondary) border-none text-sm focus:ring-1 focus:ring-(--color-accent) outline-none"
                      />
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto scrollbar-subtle p-2 space-y-1">
                    {filteredProviders.map((p) => {
                      const isActive = expandedProvider === p.id
                      const isConfigured = !!localConfigs[p.id]?.apiKey
                      return (
                        <button
                          key={p.id}
                          onClick={() => setExpandedProvider(p.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left group ${
                            isActive
                              ? 'bg-(--color-accent-muted)'
                              : 'hover:bg-(--color-surface-hover)'
                          }`}
                        >
                          <div className={`p-1.5 rounded-md transition-colors ${
                            isActive ? 'bg-(--color-accent) text-white' : 'bg-(--color-surface-secondary) text-(--color-text-tertiary) group-hover:text-(--color-text)'
                          }`}>
                            <Cpu size={14} />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate text-(--color-text)">
                              {p.name}
                            </div>
                            {isConfigured && (
                              <div className="text-[10px] text-(--color-success) font-medium flex items-center gap-1 mt-0.5">
                                <Check size={10} /> Configured
                              </div>
                            )}
                          </div>
                          <ChevronRight size={14} className={`shrink-0 transition-transform ${isActive ? 'text-(--color-accent)' : 'text-transparent group-hover:text-(--color-border-hover)'}`} />
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Provider Detail Form */}
                <div className="flex-1 p-8 bg-(--color-bg) overflow-y-auto">
                  {expandedProvider && provider && cfg ? (
                    <div className="max-w-xl mx-auto space-y-8 animate-fade-in">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-(--color-accent-muted) text-(--color-accent)">
                          <Cpu size={20} />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-(--color-text)">{provider.name}</h2>
                          <p className="text-sm text-(--color-text-secondary) mt-1">Configure API access and default model</p>
                        </div>
                      </div>

                      <div className="space-y-6 bg-(--color-surface) p-6 rounded-2xl border border-(--color-border) shadow-sm">
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-(--color-text)">
                            API Key {envVar && <span className="text-(--color-text-tertiary) font-normal ml-1">({envVar})</span>}
                          </label>
                          <div className="relative">
                            <input
                              type={showKey ? 'text' : 'password'}
                              value={cfg.apiKey}
                              onChange={(e) => handleConfigChange(expandedProvider, 'apiKey', e.target.value)}
                              placeholder="Enter API Key..."
                              className="w-full px-4 py-2.5 pr-10 rounded-xl bg-(--color-bg) border border-(--color-border) focus:border-(--color-accent) focus:ring-1 focus:ring-(--color-accent) outline-none text-sm font-mono transition-all"
                            />
                            <button
                              type="button"
                              onClick={() => setShowKey(!showKey)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-(--color-text-tertiary) hover:text-(--color-text) transition-colors"
                            >
                              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-(--color-text)">Default Model</label>
                          <div className="relative">
                            {modelKeys.length > 0 ? (
                              <select
                                value={cfg.model}
                                onChange={(e) => handleConfigChange(expandedProvider, 'model', e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl bg-(--color-bg) border border-(--color-border) focus:border-(--color-accent) focus:ring-1 focus:ring-(--color-accent) outline-none text-sm appearance-none cursor-pointer pr-10"
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
                                className="w-full px-4 py-2.5 rounded-xl bg-(--color-bg) border border-(--color-border) focus:border-(--color-accent) focus:ring-1 focus:ring-(--color-accent) outline-none text-sm"
                              />
                            )}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-(--color-text)">Base URL (Optional)</label>
                          <input
                            type="text"
                            value={cfg.baseUrl || ''}
                            onChange={(e) => handleConfigChange(expandedProvider, 'baseUrl', e.target.value)}
                            placeholder="https://api.openai.com/v1"
                            className="w-full px-4 py-2.5 rounded-xl bg-(--color-bg) border border-(--color-border) focus:border-(--color-accent) focus:ring-1 focus:ring-(--color-accent) outline-none text-sm font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-60">
                      <Cpu size={40} className="text-(--color-text-tertiary) mb-4" />
                      <h4 className="text-sm font-semibold text-(--color-text)">Select a Provider</h4>
                      <p className="text-sm text-(--color-text-tertiary) mt-1 max-w-xs">Choose a provider from the list to configure its API access.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div className="p-10 max-w-2xl mx-auto animate-slide-up">
                <div className="space-y-8">
                  <div>
                    <h4 className="text-sm font-bold text-(--color-text) mb-4">Interface Theme</h4>
                    <div className="grid grid-cols-2 gap-4">
                      {(['light', 'dark'] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setTheme(t)}
                          className={`flex flex-col items-center gap-3 p-6 rounded-2xl border-2 transition-all ${
                            theme === t 
                              ? 'border-(--color-accent) bg-(--color-accent-muted)' 
                              : 'border-(--color-border) hover:border-(--color-border-hover) bg-(--color-surface)'
                          }`}
                        >
                          {t === 'light' ? <Sun size={24} className={theme === t ? 'text-(--color-accent)' : 'text-(--color-text-secondary)'} /> : <Moon size={24} className={theme === t ? 'text-(--color-accent)' : 'text-(--color-text-secondary)'} />}
                          <span className={`text-sm font-bold ${theme === t ? 'text-(--color-accent)' : 'text-(--color-text)'}`}>
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'mcp' && <div className="p-8"><MCPSettings /></div>}
            {activeTab === 'skills' && <div className="p-8"><SkillSettings /></div>}
          </div>

          {/* Action Footer */}
          <footer className="h-20 px-8 border-t border-(--color-border-light) bg-(--color-surface) flex items-center justify-end gap-3 shrink-0 z-10">
            <button 
              onClick={onClose} 
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-(--color-text-secondary) hover:bg-(--color-surface-secondary) hover:text-(--color-text) transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                saved 
                  ? 'bg-(--color-success) text-white' 
                  : 'bg-(--color-accent) text-white hover:opacity-90 shadow-sm shadow-(--color-accent)/20'
              } disabled:opacity-50`}
            >
              {saving ? <RefreshCw size={16} className="animate-spin" /> : saved ? <CheckCircle size={16} /> : <Save size={16} />}
              {saved ? 'Saved' : saving ? 'Saving...' : 'Apply Changes'}
            </button>
          </footer>
        </div>
      </div>
    </div>
  )
}
