import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
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

  return createPortal(
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 sm:p-12 bg-black/50 backdrop-blur-xl animate-fade-in">
      <div className="w-full max-w-6xl h-[85vh] flex flex-row bg-bg shadow-[0_24px_80px_rgba(0,0,0,0.3)] rounded-[32px] border border-border-light animate-scale-in relative overflow-hidden">
        
        {/* Settings Sidebar */}
        <aside className="w-[300px] bg-linear-to-b from-surface-secondary/90 to-surface-tertiary/90 border-r border-border flex flex-col shrink-0 relative backdrop-blur-3xl">
          <div className="px-12 pt-20 pb-12 relative z-10">
            <h2 className="text-6xl font-bold text-text tracking-tighter leading-none drop-shadow-sm">Settings</h2>
            <p className="text-[11px] text-accent font-bold uppercase tracking-[0.5em] mt-4 opacity-50">Intelligence Hub</p>
          </div>

          <nav className="flex-1 px-8 space-y-4 overflow-y-auto scrollbar-subtle">
            {[
              { id: 'provider', icon: Cpu, label: 'AI Providers' },
              { id: 'mcp', icon: Server, label: 'MCP Servers' },
              { id: 'skills', icon: Sparkles, label: 'Skills' },
              { id: 'appearance', icon: theme === 'light' ? Sun : Moon, label: 'Appearance' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-5 px-8 py-5 rounded-[20px] text-[15px] font-bold tracking-tight transition-all duration-500 group relative ${
                  activeTab === item.id
                    ? 'text-accent'
                    : 'text-text-secondary hover:bg-surface-tertiary/70 hover:text-text'
                }`}
              >
                {activeTab === item.id && (
                  <motion.div 
                    layoutId="activeTab"
                    className="absolute inset-0 bg-accent-subtle rounded-[20px] ring-1 ring-accent/25 shadow-[0_8px_24px_rgb(var(--color-accent-rgb),0.04)]"
                  />
                )}
                <item.icon size={20} className={`relative z-10 transition-colors duration-500 ${activeTab === item.id ? 'text-accent' : 'text-text-tertiary group-hover:text-text-secondary'}`} />
                <span className="relative z-10">{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="px-12 pb-12 pt-6">
            <div className="flex items-center gap-4 px-6 py-4 rounded-[24px] bg-surface/50 border border-border-light backdrop-blur-2xl shadow-[0_4px_16px_rgba(0,0,0,0.02)] ring-1 ring-black/[0.02]">
              <div className="relative">
                <div className={`w-3 h-3 rounded-full ${providerList.length > 0 ? 'bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.6)]' : 'bg-red-400'}`} />
                {providerList.length > 0 && <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-30" />}
              </div>
              <span className={`text-[11px] font-bold uppercase tracking-[0.25em] ${
                providerList.length > 0 ? 'text-green-600/90' : 'text-red-400/90'
              }`}>
                Kilo {providerList.length > 0 ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-bg/98 backdrop-blur-md">
          {/* Header */}
          <header className="shrink-0 flex items-center justify-between px-16 h-28 border-b border-border-light">
            <div className="flex flex-col">
              <h3 className="text-3xl font-bold text-text tracking-tighter">
                {activeTab === 'provider' && 'AI Model Providers'}
                {activeTab === 'mcp' && 'MCP Servers'}
                {activeTab === 'skills' && 'Skills'}
                {activeTab === 'appearance' && 'Appearance'}
              </h3>
              <p className="text-[14px] text-text-tertiary font-medium mt-1 tracking-tight opacity-70">Manage your {activeTab} settings</p>
            </div>
            <button
              onClick={onClose}
              className="p-4 rounded-[20px] bg-surface-secondary/50 text-text-tertiary hover:text-text hover:bg-surface-secondary hover:rotate-90 transition-all duration-700 shadow-sm border border-border-light group"
            >
              <X size={20} className="group-hover:scale-110 transition-transform" />
            </button>
          </header>

          {/* Content Area */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'provider' && (
              <div className="flex h-full">
                {/* Provider List */}
                <aside className="w-[300px] border-r border-border-light flex flex-col shrink-0 bg-surface-secondary/15">
                  <div className="px-10 py-8 space-y-6">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-text-tertiary uppercase tracking-[0.2em] opacity-60">
                        {providerList.length} Models
                      </span>
                      <button
                        onClick={fetchProviders}
                        disabled={fetching}
                        className="p-3 rounded-xl hover:bg-surface-tertiary text-text-tertiary hover:text-accent transition-all disabled:opacity-40"
                      >
                        <RefreshCw size={16} className={fetching ? 'animate-spin' : ''} />
                      </button>
                    </div>
                    <div className="flex items-center gap-4 px-6 py-4 rounded-[24px] bg-surface border border-border-light focus-within:border-accent/50 focus-within:ring-[8px] focus-within:ring-accent-subtle transition-all duration-500 shadow-[inset_0_1px_6px_rgba(0,0,0,0.02)]">
                      <Search size={18} className="text-text-quaternary shrink-0" />
                      <input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search..."
                        className="flex-1 bg-transparent text-[15px] text-text placeholder:text-text-quaternary outline-none min-w-0 font-bold tracking-tight"
                      />
                    </div>
                  </div>
                  
                  <ScrollShadow className="flex-1 px-8 pb-10 space-y-3">
                    {filteredProviders.map((p) => {
                      const isActive = expandedProvider === p.id
                      const isConfigured = !!localConfigs[p.id]?.apiKey
                      return (
                        <button
                          key={p.id}
                          onClick={() => setExpandedProvider(p.id)}
                          className={`w-full flex items-center gap-5 px-6 py-5 rounded-[24px] transition-all duration-500 text-left group relative ${
                            isActive 
                              ? 'bg-accent-subtle shadow-[0_8px_24px_rgba(var(--color-accent-rgb),0.08)] ring-1 ring-accent/25' 
                              : 'hover:bg-surface-secondary/90'
                          }`}
                        >
                          <div className={`p-4 rounded-[16px] transition-all duration-500 ${
                            isActive 
                              ? 'bg-accent text-accent-foreground shadow-xl shadow-accent/40' 
                              : 'bg-surface-tertiary text-text-tertiary group-hover:text-text group-hover:bg-surface-tertiary/95'
                          }`}>
                            <Cpu size={16} />
                          </div>
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className={`text-[15px] font-bold tracking-tight truncate ${
                              isActive ? 'text-accent' : 'text-text-secondary'
                            }`}>{p.name}</span>
                            <span className="text-[10px] text-text-tertiary font-bold uppercase tracking-widest mt-1 opacity-40">
                              {p.source || 'Cloud API'}
                            </span>
                          </div>
                          {isConfigured && (
                            <div className="w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/20 shadow-sm">
                              <Check size={12} className="text-green-500" />
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </ScrollShadow>
                </aside>

                {/* Provider Detail Form */}
                <ScrollShadow className="flex-1">
                  <div className="max-w-3xl mx-auto px-16 py-16 space-y-16">
                    {expandedProvider && provider && cfg ? (
                      <div className="animate-fade-in-up space-y-16">
                        <div className="flex items-center gap-8">
                          <div className="p-8 rounded-[32px] bg-accent text-accent-foreground shadow-xl shadow-accent/40">
                            <Cpu size={48} />
                          </div>
                          <div>
                            <h2 className="text-5xl font-bold text-text tracking-tighter leading-tight">{provider.name}</h2>
                            <div className="flex items-center gap-4 mt-2">
                              <span className="px-5 py-2 rounded-full bg-accent-subtle text-accent text-[12px] font-bold uppercase tracking-[0.2em] border border-accent/25 shadow-sm">
                                {provider.id}
                              </span>
                              <span className="text-[14px] text-text-tertiary font-bold opacity-50 uppercase tracking-widest">Profile</span>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-10">
                          <div className="space-y-6">
                            <div className="flex items-center justify-between ml-4">
                              <label className="text-[12px] font-bold uppercase tracking-[0.3em] text-text-tertiary opacity-70">
                                API Access Key
                              </label>
                              {envVar && <span className="text-[11px] font-mono text-accent opacity-70 px-4 py-1.5 bg-accent-subtle rounded-xl border border-accent/20 shadow-sm">{envVar}</span>}
                            </div>
                            <div className="relative group">
                              <input
                                type={showKey ? 'text' : 'password'}
                                value={cfg.apiKey}
                                onChange={(e) => handleConfigChange(expandedProvider, 'apiKey', e.target.value)}
                                placeholder="Paste token..."
                                className="w-full px-8 py-5 rounded-[24px] bg-surface-secondary/50 border border-border-light text-[15px] font-mono text-text placeholder:text-text-quaternary outline-none focus:bg-surface focus:border-accent/50 focus:ring-[12px] focus:ring-accent-subtle transition-all duration-500 pr-16 shadow-[inset_0_1px_6px_rgba(0,0,0,0.02)]"
                              />
                              <button
                                type="button"
                                onClick={() => setShowKey(!showKey)}
                                className="absolute right-6 top-1/2 -translate-y-1/2 p-4 rounded-xl text-text-tertiary hover:text-text hover:bg-surface-tertiary transition-all duration-300"
                              >
                                {showKey ? <EyeOff size={20} /> : <Eye size={20} />}
                              </button>
                            </div>
                          </div>

                          <div className="space-y-6">
                            <label className="text-[12px] font-bold uppercase tracking-[0.3em] text-text-tertiary ml-4 opacity-70">Model Selection</label>
                            {modelKeys.length > 0 ? (
                              <Select
                                selectedKey={cfg.model}
                                onSelectionChange={(key: any) => {
                                  if (key) handleConfigChange(expandedProvider, 'model', key as string);
                                }}
                                placeholder="Choose model..."
                              >
                                <SelectTrigger className="w-full px-8 py-5 rounded-[24px] bg-surface-secondary/50 border border-border-light outline-none focus:bg-surface focus:border-accent/50 text-[15px] font-bold tracking-tight transition-all duration-500 h-auto shadow-[inset_0_1px_6px_rgba(0,0,0,0.02)]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectPopover className="bg-surface/95 border border-border shadow-[0_16px_64px_rgba(0,0,0,0.15)] rounded-[24px] overflow-hidden backdrop-blur-3xl">
                                  <ListBox items={modelKeys.map(m => ({ id: m, name: m }))} className="p-4">
                                    {(item: any) => (
                                      <ListBoxItem 
                                        key={item.id} 
                                        id={item.id} 
                                        textValue={item.name}
                                        className="rounded-[16px] px-6 py-4 text-[15px] text-text-secondary hover:text-text hover:bg-surface-secondary data-[selected=true]:text-accent data-[selected=true]:bg-accent-subtle transition-all duration-300"
                                      >
                                        <div className="flex items-center gap-4">
                                          <Sparkles size={16} className="text-accent opacity-60" />
                                          <span className="font-bold tracking-tight">{item.name}</span>
                                        </div>
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
                                className="w-full px-8 py-5 rounded-[24px] bg-surface-secondary/50 border border-border-light text-[15px] font-bold text-text placeholder:text-text-quaternary outline-none focus:bg-surface focus:border-accent/50 focus:ring-[12px] focus:ring-accent-subtle transition-all duration-500 shadow-[inset_0_1px_6px_rgba(0,0,0,0.02)]"
                              />
                            )}
                          </div>

                          <div className="space-y-6">
                            <label className="text-[12px] font-bold uppercase tracking-[0.3em] text-text-tertiary ml-4 opacity-70">Custom Gateway</label>
                            <div className="relative">
                              <input
                                value={cfg.baseUrl || ''}
                                onChange={(e) => handleConfigChange(expandedProvider, 'baseUrl', e.target.value)}
                                placeholder="https://api.custom-proxy.com/v1"
                                className="w-full px-8 py-5 rounded-[24px] bg-surface-secondary/50 border border-border-light text-[15px] font-mono text-text placeholder:text-text-quaternary outline-none focus:bg-surface focus:border-accent/50 focus:ring-[12px] focus:ring-accent-subtle transition-all duration-500 shadow-[inset_0_1px_6px_rgba(0,0,0,0.02)]"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center px-12 py-32">
                        <div className="relative mb-12">
                          <div className="absolute inset-0 bg-accent/25 blur-[100px] rounded-full scale-150 animate-pulse" />
                          <div className="relative w-40 h-40 rounded-[42%] bg-surface border border-border-light flex items-center justify-center backdrop-blur-3xl shadow-2xl animate-float">
                            <Cpu size={80} className="text-accent opacity-40" />
                          </div>
                        </div>
                        <h4 className="text-4xl font-bold text-text tracking-tighter mb-6">Select a Model Provider</h4>
                        <p className="text-[16px] text-text-tertiary max-w-[320px] leading-relaxed font-bold opacity-60">Choose an AI orchestration provider to configure.</p>
                      </div>
                    )}
                  </div>
                </ScrollShadow>
              </div>
            )}

            {activeTab === 'appearance' && (
              <ScrollShadow className="h-full px-16 py-16 animate-fade-in">
                <div className="max-w-3xl mx-auto">
                  <div className="mb-12">
                    <div className="flex flex-col mb-10">
                      <h4 className="text-[11px] font-bold uppercase tracking-[0.3em] text-accent mb-4 opacity-60">Visual Style</h4>
                      <h2 className="text-4xl font-bold text-text tracking-tighter">Interface Theme</h2>
                      <p className="text-[15px] text-text-tertiary mt-2 font-medium opacity-70 tracking-tight">Customize the look and feel</p>
                    </div>
                    <div className="grid grid-cols-2 gap-8">
                      {(['light', 'dark'] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setTheme(t)}
                          className={`group relative flex flex-col items-center gap-8 p-12 rounded-[40px] border-2 transition-all duration-700 ${
                            theme === t 
                              ? 'border-accent bg-accent-subtle shadow-[0_24px_80px_rgba(var(--color-accent-rgb),0.15)] -translate-y-2' 
                              : 'border-border-light hover:border-border-hover bg-surface hover:-translate-y-1 shadow-sm'
                          }`}
                        >
                          <div className={`p-8 rounded-[24px] transition-all duration-700 ${
                            theme === t 
                              ? 'bg-accent text-accent-foreground shadow-2xl shadow-accent/50' 
                              : 'bg-surface-secondary text-text-tertiary group-hover:text-text group-hover:bg-surface-tertiary'
                          }`}>
                            {t === 'light' ? <Sun size={40} /> : <Moon size={40} />}
                          </div>
                          <div className="text-center">
                            <span className={`text-2xl font-bold tracking-tighter block ${
                              theme === t ? 'text-accent' : 'text-text'
                            }`}>
                              {t === 'light' ? 'Daylight' : 'Midnight'}
                            </span>
                            <span className="text-[11px] text-text-tertiary font-bold uppercase tracking-[0.25em] mt-2 block opacity-40">
                              {t === 'light' ? 'Clean & Crisp' : 'Deep & Focused'}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </ScrollShadow>
            )}

            {activeTab === 'mcp' && (
              <ScrollShadow className="h-full px-16 py-12">
                <MCPSettings />
              </ScrollShadow>
            )}
            {activeTab === 'skills' && (
              <ScrollShadow className="h-full px-16 py-12">
                <SkillSettings />
              </ScrollShadow>
            )}
          </div>

          {/* Footer */}
          <footer className="shrink-0 flex items-center justify-end gap-6 px-16 h-24 border-t border-border-light bg-surface/50 backdrop-blur-3xl">
            <button
              onClick={onClose}
              className="px-10 py-4 rounded-xl text-[15px] font-bold text-text-secondary hover:bg-surface-secondary hover:text-text transition-all duration-400 border border-transparent hover:border-border-light"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`inline-flex items-center gap-4 px-12 py-4 rounded-[20px] text-[15px] font-bold transition-all duration-700 relative overflow-hidden group ${
                saved
                  ? 'text-green-600 bg-green-500/10 border border-green-500/20 shadow-[0_0_32px_rgba(34,197,94,0.1)]'
                  : 'bg-accent text-accent-foreground hover:bg-accent-light shadow-[0_12px_40px_rgba(var(--color-accent-rgb),0.3)] hover:shadow-[0_16px_60px_rgba(var(--color-accent-rgb),0.4)] hover:-translate-y-1 active:translate-y-0'
              }`}
            >
              {saving ? (
                <RefreshCw size={20} className="animate-spin" />
              ) : saved ? (
                <CheckCircle size={20} className="animate-fade-in" />
              ) : null}
              <span className="relative z-10">
                {saved ? 'Changes Applied' : saving ? 'Syncing...' : 'Apply & Save'}
              </span>
              {!saved && !saving && (
                <div className="absolute inset-0 bg-linear-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
              )}
            </button>
          </footer>
        </div>

      </div>
    </div>,
    document.body
  )
}
