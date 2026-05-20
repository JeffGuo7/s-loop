import { useState, useEffect, useMemo } from 'react'
import { useAppStore } from '../../stores'
import { X, Cpu, Eye, EyeOff, Server, Sparkles, RefreshCw, Search, CheckCircle, Check, Sun, Moon } from 'lucide-react'
import type { ProviderConfig } from '../../types'
import { MCPSettings } from '../mcp'
import { SkillSettings } from '../skills'
import { Kilo } from '../../utils'
import { ScrollShadow, Select, SelectTrigger, SelectValue, SelectPopover, ListBox, ListBoxItem } from "@heroui/react"

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
  const [activeTab, setActiveTab] = useState('provider')
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-10 bg-black/20 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-5xl h-[85vh] flex flex-row overflow-hidden bg-(--color-bg) shadow-2xl rounded-[28px] border border-(--color-border-light) animate-scale-in">
        
        {/* Settings Sidebar */}
        <aside className="w-64 bg-(--color-surface) border-r border-(--color-border) flex flex-col shrink-0">
          <div className="px-8 pt-10 pb-6">
            <h2 className="text-xl font-bold text-(--color-text) tracking-tight">Settings</h2>
            <p className="text-[10px] text-(--color-text-tertiary) mt-1.5 font-semibold uppercase tracking-[0.15em]">Intelligence Hub</p>
          </div>

          <nav className="flex-1 px-4 space-y-1 overflow-y-auto scrollbar-subtle">
            {[
              { id: 'provider', icon: Cpu, label: 'AI Providers' },
              { id: 'mcp', icon: Server, label: 'MCP Servers' },
              { id: 'skills', icon: Sparkles, label: 'Skills' },
              { id: 'appearance', icon: theme === 'light' ? Sun : Moon, label: 'Appearance' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-sm font-semibold tracking-tight transition-all duration-200 ${
                  activeTab === item.id
                    ? 'bg-(--color-accent-muted) text-(--color-accent)'
                    : 'text-(--color-text-secondary) hover:bg-(--color-surface-secondary) hover:text-(--color-text)'
                }`}
              >
                <item.icon size={17} className={activeTab === item.id ? 'text-(--color-accent)' : 'text-(--color-text-tertiary)'} />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="px-6 pb-8 pt-4">
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-(--color-surface-secondary)/60 border border-(--color-border-light)">
              <div className={`w-2 h-2 rounded-full ${providerList.length > 0 ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.4)]' : 'bg-red-400'}`} />
              <span className={`text-[9px] font-bold uppercase tracking-[0.15em] ${
                providerList.length > 0 ? 'text-green-600' : 'text-red-400'
              }`}>
                Kilo {providerList.length > 0 ? 'Connected' : 'Offline'}
              </span>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-(--color-bg)">
          {/* Header */}
          <header className="shrink-0 flex items-center justify-between px-10 h-16 border-b border-(--color-border-light)">
            <h3 className="text-[15px] font-semibold text-(--color-text) tracking-tight">
              {activeTab === 'provider' && 'AI Model Providers'}
              {activeTab === 'mcp' && 'MCP Servers'}
              {activeTab === 'skills' && 'Skills'}
              {activeTab === 'appearance' && 'Appearance'}
            </h3>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-(--color-surface-secondary) text-(--color-text-tertiary) hover:text-(--color-text) transition-all"
            >
              <X size={18} />
            </button>
          </header>

          {/* Content Area */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'provider' && (
              <div className="flex h-full">
                {/* Provider List */}
                <aside className="w-[280px] border-r border-(--color-border-light) flex flex-col shrink-0">
                  <div className="px-5 py-5 border-b border-(--color-border-light) space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-(--color-text-tertiary) uppercase tracking-[0.15em]">
                        {providerList.length} Available
                      </span>
                      <button
                        onClick={fetchProviders}
                        disabled={fetching}
                        className="p-1.5 rounded-xl hover:bg-(--color-surface-secondary) text-(--color-text-tertiary) hover:text-(--color-accent) transition-all disabled:opacity-40"
                      >
                        <RefreshCw size={13} className={fetching ? 'animate-spin' : ''} />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-(--color-surface) border border-(--color-border-light) focus-within:border-(--color-accent)/40 focus-within:shadow-[0_0_0_3px_var(--color-accent-muted)] transition-all">
                      <Search size={14} className="text-(--color-text-quaternary) shrink-0" />
                      <input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search providers..."
                        className="flex-1 bg-transparent text-sm text-(--color-text) placeholder:text-(--color-text-quaternary) outline-none min-w-0"
                      />
                    </div>
                  </div>
                  
                  <ScrollShadow className="flex-1 px-2.5 py-3 space-y-0.5">
                    {filteredProviders.map((p) => {
                      const isActive = expandedProvider === p.id
                      const isConfigured = !!localConfigs[p.id]?.apiKey
                      return (
                        <button
                          key={p.id}
                          onClick={() => setExpandedProvider(p.id)}
                          className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl transition-all duration-200 text-left ${
                            isActive 
                              ? 'bg-(--color-accent-muted)' 
                              : 'hover:bg-(--color-surface-secondary)'
                          }`}
                        >
                          <div className={`p-2 rounded-xl transition-all duration-200 ${
                            isActive 
                              ? 'bg-(--color-accent) text-white shadow-sm shadow-(--color-accent)/20' 
                              : 'bg-(--color-surface-secondary) text-(--color-text-tertiary)'
                          }`}>
                            <Cpu size={13} />
                          </div>
                          <span className={`flex-1 text-sm font-medium tracking-tight ${
                            isActive ? 'text-(--color-accent)' : 'text-(--color-text-secondary)'
                          }`}>{p.name}</span>
                          {isConfigured && (
                            <div className="w-4 h-4 rounded-full bg-green-500/10 flex items-center justify-center">
                              <Check size={8} className="text-green-500" />
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </ScrollShadow>
                </aside>

                {/* Provider Detail Form */}
                <ScrollShadow className="flex-1 px-12 py-10">
                  {expandedProvider && provider && cfg ? (
                    <div className="max-w-lg mx-auto space-y-10 animate-fade-in">
                      <div className="flex items-center gap-4 pb-2">
                        <div className="p-3 rounded-2xl bg-(--color-accent-muted) text-(--color-accent)">
                          <Cpu size={22} />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-(--color-text) tracking-tight">{provider.name}</h2>
                          <p className="text-xs text-(--color-text-tertiary) mt-0.5">Configure API credentials and operational parameters</p>
                        </div>
                      </div>

                      <div className="space-y-7">
                        <div className="space-y-2.5">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-(--color-text-tertiary)">
                              API Key {envVar && <span className="opacity-40 lowercase ml-1 font-mono">({envVar})</span>}
                            </label>
                          </div>
                          <div className="relative">
                            <input
                              type={showKey ? 'text' : 'password'}
                              value={cfg.apiKey}
                              onChange={(e) => handleConfigChange(expandedProvider, 'apiKey', e.target.value)}
                              placeholder="sk-..."
                              className="w-full px-4 py-3.5 rounded-2xl bg-(--color-surface) border border-(--color-border-light) text-sm font-mono text-(--color-text) placeholder:text-(--color-text-quaternary) outline-none focus:border-(--color-accent)/30 focus:shadow-[0_0_0_3px_var(--color-accent-muted)] transition-all pr-12"
                            />
                            <button
                              type="button"
                              onClick={() => setShowKey(!showKey)}
                              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-(--color-text-tertiary) hover:text-(--color-text) hover:bg-(--color-surface-secondary) transition-all"
                            >
                              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2.5">
                          <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-(--color-text-tertiary)">Model</label>
                          {modelKeys.length > 0 ? (
                            <Select
                              selectedKey={cfg.model}
                              onSelectionChange={(key: any) => {
                                if (key) handleConfigChange(expandedProvider, 'model', key as string);
                              }}
                              placeholder="Select a model"
                            >
                              <SelectTrigger className="w-full px-4 py-3.5 rounded-2xl bg-(--color-surface) border border-(--color-border-light) outline-none focus:border-(--color-accent)/30 text-sm transition-all data-[open=true]:border-(--color-accent)/30">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectPopover>
                                <ListBox items={modelKeys.map(m => ({ id: m, name: m }))}>
                                  {(item) => (
                                    <ListBoxItem key={item.id} id={item.id} textValue={item.name}>
                                      {item.name}
                                    </ListBoxItem>
                                  )}
                                </ListBox>
                              </SelectPopover>
                            </Select>
                          ) : (
                            <input
                              value={cfg.model}
                              onChange={(e) => handleConfigChange(expandedProvider, 'model', e.target.value)}
                              placeholder="e.g., gpt-4-turbo"
                              className="w-full px-4 py-3.5 rounded-2xl bg-(--color-surface) border border-(--color-border-light) text-sm text-(--color-text) placeholder:text-(--color-text-quaternary) outline-none focus:border-(--color-accent)/30 focus:shadow-[0_0_0_3px_var(--color-accent-muted)] transition-all"
                            />
                          )}
                        </div>

                        <div className="space-y-2.5">
                          <label className="text-[10px] font-bold uppercase tracking-[0.15em] text-(--color-text-tertiary)">Base URL (Optional)</label>
                          <input
                            value={cfg.baseUrl || ''}
                            onChange={(e) => handleConfigChange(expandedProvider, 'baseUrl', e.target.value)}
                            placeholder="https://api.openai.com/v1"
                            className="w-full px-4 py-3.5 rounded-2xl bg-(--color-surface) border border-(--color-border-light) text-sm font-mono text-(--color-text) placeholder:text-(--color-text-quaternary) outline-none focus:border-(--color-accent)/30 focus:shadow-[0_0_0_3px_var(--color-accent-muted)] transition-all"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center px-8">
                      <div className="w-20 h-20 rounded-[30%_70%_60%_40%_/_50%_40%_60%_50%] bg-(--color-surface-secondary)/80 border border-(--color-border-light) flex items-center justify-center mb-6 backdrop-blur-xl">
                        <Cpu size={36} className="text-(--color-text-tertiary) opacity-40" />
                      </div>
                      <h4 className="text-base font-semibold text-(--color-text) tracking-tight mb-1.5">No Provider Selected</h4>
                      <p className="text-sm text-(--color-text-tertiary) max-w-[260px] leading-relaxed">Choose a provider from the list to configure its settings.</p>
                    </div>
                  )}
                </ScrollShadow>
              </div>
            )}

            {activeTab === 'appearance' && (
              <ScrollShadow className="h-full px-12 py-10 animate-fade-in">
                <div className="max-w-lg">
                  <div className="mb-10">
                    <h4 className="text-[10px] font-bold uppercase tracking-[0.15em] text-(--color-text-tertiary) mb-6">Interface Theme</h4>
                    <div className="flex gap-4">
                      {(['light', 'dark'] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setTheme(t)}
                          className={`flex-1 flex flex-col items-center gap-5 p-8 rounded-3xl border-2 transition-all duration-300 ${
                            theme === t 
                              ? 'border-(--color-accent) bg-(--color-accent-muted) shadow-lg shadow-(--color-accent)/5' 
                              : 'border-(--color-border) hover:border-(--color-border-hover) bg-(--color-surface)'
                          }`}
                        >
                          <div className={`p-5 rounded-2xl transition-all ${
                            theme === t 
                              ? 'bg-(--color-accent) text-white shadow-lg shadow-(--color-accent)/20' 
                              : 'bg-(--color-surface-secondary) text-(--color-text-tertiary)'
                          }`}>
                            {t === 'light' ? <Sun size={28} /> : <Moon size={28} />}
                          </div>
                          <span className={`text-sm font-semibold tracking-tight ${
                            theme === t ? 'text-(--color-accent)' : 'text-(--color-text)'
                          }`}>
                            {t === 'light' ? 'Light Mode' : 'Dark Mode'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </ScrollShadow>
            )}

            {activeTab === 'mcp' && (
              <ScrollShadow className="h-full px-12 py-10">
                <MCPSettings />
              </ScrollShadow>
            )}
            {activeTab === 'skills' && (
              <ScrollShadow className="h-full px-12 py-10">
                <SkillSettings />
              </ScrollShadow>
            )}
          </div>

          {/* Footer */}
          <footer className="shrink-0 flex items-center justify-end gap-4 px-10 h-16 border-t border-(--color-border-light)">
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl text-sm font-medium text-(--color-text-secondary) hover:bg-(--color-surface-secondary) hover:text-(--color-text) transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`inline-flex items-center gap-2.5 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
                saved
                  ? 'text-green-600 bg-green-500/10'
                  : 'bg-(--color-accent) text-white hover:bg-(--color-accent-light) shadow-md shadow-(--color-accent)/15 hover:shadow-lg hover:shadow-(--color-accent)/20'
              }`}
            >
              {saving ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : saved ? (
                <CheckCircle size={16} />
              ) : null}
              <span>
                {saved ? 'Applied' : saving ? 'Saving...' : 'Apply'}
              </span>
            </button>
          </footer>
        </div>
      </div>
    </div>
  )
}
