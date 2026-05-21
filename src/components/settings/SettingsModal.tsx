import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { useAppStore } from '../../stores'
import { X, Cpu, Eye, EyeOff, Server, Sparkles, RefreshCw, Search, CheckCircle, Check, Sun, Moon, AlertTriangle } from 'lucide-react'
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
  const [modelSearchQuery, setModelSearchQuery] = useState('')
  const [missingModelWarning, setMissingModelWarning] = useState(false)

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
    setModelSearchQuery('') // Reset model search when switching
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

    // Check if any provider has API key but no model selected
    const hasMissingModel = Object.entries(localConfigs).some(
      ([_, cfg]) => cfg.apiKey && !cfg.model,
    )
    if (hasMissingModel) {
      setMissingModelWarning(true)
      setTimeout(() => setMissingModelWarning(false), 5000)
    }
  }

  const filteredProviders = useMemo(() => {
    if (!searchQuery) return providerList
    const q = searchQuery.toLowerCase()
    return providerList.filter(p => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
  }, [providerList, searchQuery])

  const provider = providerList.find((p) => p.id === expandedProvider)
  const cfg = expandedProvider ? localConfigs[expandedProvider] || { apiKey: '', model: '', baseUrl: '' } : null
  
  // Filtered models based on modelSearchQuery
  const filteredModels = useMemo(() => {
    if (!provider) return []
    const allModels = Object.keys(provider.models || {})
    if (!modelSearchQuery) return allModels
    const q = modelSearchQuery.toLowerCase()
    return allModels.filter(m => m.toLowerCase().includes(q))
  }, [provider, modelSearchQuery])

  const [showModelDropdown, setShowModelDropdown] = useState(false)

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

          <nav className="flex-1 px-8 pt-4 space-y-4 overflow-y-auto scrollbar-subtle">
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
              <div className="h-full flex flex-col">
                {/* Single Focused View */}
                <ScrollShadow className="flex-1">
                  <div className="max-w-4xl mx-auto px-12 py-12 space-y-12">
                    
                    {!expandedProvider ? (
                      /* Provider Selection Grid - More Spacious */
                      <div className="space-y-10 animate-fade-in">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <h4 className="text-2xl font-bold text-text tracking-tight">Select Provider</h4>
                            <p className="text-[13px] text-text-tertiary font-medium">Choose an AI service to configure</p>
                          </div>
                          <div className="flex items-center gap-4 px-5 py-2.5 rounded-2xl bg-surface-secondary/50 border border-border-light focus-within:border-accent/50 transition-all duration-300 w-64">
                            <Search size={14} className="text-text-quaternary" />
                            <input
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              placeholder="Search providers..."
                              className="bg-transparent text-[13px] font-bold text-text outline-none w-full"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                          {filteredProviders.map((p) => {
                            const isConfigured = !!localConfigs[p.id]?.apiKey
                            return (
                              <button
                                key={p.id}
                                onClick={() => setExpandedProvider(p.id)}
                                className="group relative p-8 rounded-[32px] bg-white/40 dark:bg-white/5 border border-border-light hover:border-accent/30 hover:bg-accent-subtle transition-all duration-500 text-left shadow-sm hover:shadow-xl hover:-translate-y-1"
                              >
                                <div className="flex items-center justify-between mb-6">
                                  <div className="p-4 rounded-2xl bg-surface-tertiary text-text-tertiary group-hover:bg-accent group-hover:text-white transition-all duration-500 shadow-sm">
                                    <Cpu size={24} />
                                  </div>
                                  {isConfigured && (
                                    <div className="px-3 py-1 rounded-full bg-green-500/10 text-green-500 text-[10px] font-black uppercase tracking-widest border border-green-500/20">
                                      Active
                                    </div>
                                  )}
                                </div>
                                <h5 className="text-[17px] font-bold text-text tracking-tight mb-1">{p.name}</h5>
                                <p className="text-[11px] text-text-tertiary font-bold uppercase tracking-widest opacity-50">{p.source || 'Cloud API'}</p>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ) : provider && cfg ? (
                      /* Focused Provider Configuration - Very Spacious */
                      <div className="space-y-12 animate-fade-in-up">
                        <div className="flex items-center justify-between">
                          <button 
                            onClick={() => setExpandedProvider(null)}
                            className="flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.2em] text-text-tertiary hover:text-accent transition-colors"
                          >
                            <RefreshCw size={14} className="rotate-180" />
                            Back to list
                          </button>
                        </div>

                        <div className="flex items-center gap-8">
                          <div className="p-8 rounded-[32px] bg-accent text-accent-foreground shadow-2xl shadow-accent/20">
                            <Cpu size={48} />
                          </div>
                          <div>
                            <h2 className="text-5xl font-bold text-text tracking-tighter leading-tight">{provider.name}</h2>
                            <div className="flex items-center gap-3 mt-2">
                              <span className="px-4 py-1.5 rounded-full bg-accent-muted text-accent text-[11px] font-black uppercase tracking-widest border border-accent/10">
                                {provider.id}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-12 pt-4">
                          {/* API Key Card */}
                          <div className="space-y-6">
                            <div className="flex items-center justify-between ml-2">
                              <label className="text-[11px] font-black uppercase tracking-[0.3em] text-text-tertiary opacity-50">API Access Token</label>
                              {envVar && <span className="text-[10px] font-mono text-accent/70 bg-accent-muted px-3 py-1 rounded-lg border border-accent/10">{envVar}</span>}
                            </div>
                            <div className="relative group">
                              <input
                                type={showKey ? 'text' : 'password'}
                                value={cfg.apiKey}
                                onChange={(e) => handleConfigChange(expandedProvider, 'apiKey', e.target.value)}
                                placeholder="Paste your API key here..."
                                className="w-full px-8 py-6 rounded-[28px] bg-white/40 dark:bg-white/5 border border-border-light text-[15px] font-mono text-text outline-none focus:bg-white/80 dark:focus:bg-white/10 focus:border-accent/50 focus:ring-[16px] focus:ring-accent-subtle transition-all duration-500 pr-16 shadow-sm"
                              />
                              <button
                                type="button"
                                onClick={() => setShowKey(!showKey)}
                                className="absolute right-6 top-1/2 -translate-y-1/2 p-3 rounded-xl text-text-tertiary hover:text-text hover:bg-surface-secondary transition-all"
                              >
                                {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                              </button>
                            </div>
                          </div>

                          {/* Model Selection - Dropdown Style */}
                          <div className="space-y-6">
                            <label className="text-[11px] font-black uppercase tracking-[0.3em] text-text-tertiary ml-2 opacity-50">Model Engine</label>
                            
                            <div className="relative">
                              {/* Dropdown Trigger */}
                              <button
                                onClick={() => setShowModelDropdown(!showModelDropdown)}
                                className={`w-full flex items-center justify-between px-8 py-6 rounded-[28px] border transition-all duration-500 ${
                                  showModelDropdown 
                                    ? 'bg-white dark:bg-white/10 border-accent/50 ring-[16px] ring-accent-subtle shadow-xl' 
                                    : 'bg-white/40 dark:bg-white/5 border-border-light hover:border-accent/30 shadow-sm'
                                }`}
                              >
                                <div className="flex items-center gap-4">
                                  <Sparkles size={20} className={cfg.model ? 'text-accent' : 'text-text-tertiary opacity-40'} />
                                  <span className={`text-[15px] font-bold tracking-tight ${cfg.model ? 'text-text' : 'text-text-tertiary'}`}>
                                    {cfg.model || 'Choose a model engine...'}
                                  </span>
                                </div>
                                <RefreshCw size={18} className={`text-text-tertiary transition-transform duration-500 ${showModelDropdown ? 'rotate-180' : ''}`} />
                              </button>

                              {/* Dropdown Popover */}
                              {showModelDropdown && (
                                <>
                                  <div className="fixed inset-0 z-40" onClick={() => setShowModelDropdown(false)} />
                                  <div className="absolute top-full left-0 right-0 mt-4 z-50 bg-white/95 dark:bg-surface/95 backdrop-blur-3xl rounded-[32px] border border-border shadow-[0_24px_80px_rgba(0,0,0,0.2)] overflow-hidden animate-scale-in origin-top">
                                    <div className="p-6 border-b border-border-light">
                                      <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-surface-secondary/50 border border-border-light focus-within:border-accent/30 transition-all">
                                        <Search size={16} className="text-text-quaternary" />
                                        <input
                                          autoFocus
                                          value={modelSearchQuery}
                                          onChange={(e) => setModelSearchQuery(e.target.value)}
                                          placeholder="Filter models..."
                                          className="bg-transparent text-[14px] font-bold text-text outline-none w-full"
                                        />
                                      </div>
                                    </div>
                                    <div className="max-h-[320px] overflow-y-auto p-4 custom-scrollbar">
                                      {filteredModels.length > 0 ? (
                                        <div className="space-y-1">
                                          {filteredModels.map((m) => (
                                            <button
                                              key={m}
                                              onClick={() => {
                                                handleConfigChange(expandedProvider, 'model', m);
                                                setShowModelDropdown(false);
                                              }}
                                              className={`w-full flex items-center justify-between px-6 py-4 rounded-2xl transition-all duration-300 group ${
                                                cfg.model === m 
                                                  ? 'bg-accent/10 text-accent' 
                                                  : 'hover:bg-surface-secondary text-text-secondary hover:text-text'
                                              }`}
                                            >
                                              <span className="text-[14px] font-bold tracking-tight">{m}</span>
                                              {cfg.model === m && <Check size={16} className="text-accent" />}
                                            </button>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="py-12 text-center">
                                          <p className="text-[13px] font-bold text-text-tertiary italic opacity-50">No models found</p>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                            
                            {cfg.apiKey && !cfg.model && (
                              <div className="flex items-center gap-2 ml-4 text-amber-500 text-[12px] font-black uppercase tracking-widest animate-fade-in">
                                <AlertTriangle size={14} />
                                <span>Missing Model Engine</span>
                              </div>
                            )}
                          </div>

                          {/* Gateway Card */}
                          <div className="space-y-6">
                            <label className="text-[11px] font-black uppercase tracking-[0.3em] text-text-tertiary ml-2 opacity-50">Custom Gateway (Optional)</label>
                            <input
                              value={cfg.baseUrl || ''}
                              onChange={(e) => handleConfigChange(expandedProvider, 'baseUrl', e.target.value)}
                              placeholder="https://your-custom-proxy.com/v1"
                              className="w-full px-8 py-6 rounded-[28px] bg-white/40 dark:bg-white/5 border border-border-light text-[15px] font-mono text-text outline-none focus:bg-white/80 dark:focus:bg-white/10 focus:border-accent/50 focus:ring-[16px] focus:ring-accent-subtle transition-all duration-500 shadow-sm"
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}
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
          {missingModelWarning && (
            <div className="shrink-0 flex items-center gap-3 px-16 py-3 bg-amber-500/5 border-t border-amber-500/15 animate-fade-in">
              <AlertTriangle size={16} className="text-amber-500 shrink-0" />
              <span className="text-[13px] font-bold text-amber-500 tracking-tight">
                Some providers have API key but no model selected — please choose a model to enable chatting
              </span>
            </div>
          )}
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
