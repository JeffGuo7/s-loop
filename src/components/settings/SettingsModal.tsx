import { useState, useEffect, useMemo } from 'react'
import { useAppStore } from '../../stores'
import { X, Cpu, Eye, EyeOff, Server, Sparkles, RefreshCw, Search, CheckCircle, Save, Check, Sun, Moon } from 'lucide-react'
import type { ProviderConfig } from '../../types'
import { MCPSettings } from '../mcp'
import { SkillSettings } from '../skills'
import { Kilo } from '../../utils'
import { Button, Input, Card } from '../ui'
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
    <div className="modal-overlay p-6 sm:p-10">
      <div className="modal-content w-full max-w-6xl h-[88vh] flex flex-row overflow-hidden bg-(--color-bg) shadow-2xl rounded-[32px] border border-(--color-border-light)">
        
        {/* Settings Sidebar */}
        <aside className="w-72 bg-(--color-surface) border-r border-(--color-border) flex flex-col shrink-0">
          <div className="p-10 pb-8">
            <h2 className="text-2xl font-bold text-(--color-text) tracking-tight">Settings</h2>
            <p className="text-[11px] text-(--color-text-tertiary) mt-1.5 font-bold uppercase tracking-[0.2em] opacity-50">Intelligence Hub</p>
          </div>

          <div className="flex-1 px-5 space-y-1.5 overflow-y-auto scrollbar-subtle">
            {[
              { id: 'provider', icon: Cpu, label: 'AI Providers' },
              { id: 'mcp', icon: Server, label: 'MCP Servers' },
              { id: 'skills', icon: Sparkles, label: 'Skills' },
              { id: 'appearance', icon: theme === 'light' ? Sun : Moon, label: 'Appearance' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-4 px-5 py-4 rounded-[20px] text-sm font-bold tracking-tight transition-all duration-300 ${
                  activeTab === item.id
                    ? 'bg-(--color-accent-muted) text-(--color-accent)'
                    : 'text-(--color-text-secondary) hover:bg-(--color-surface-secondary)'
                }`}
              >
                <item.icon size={18} className={activeTab === item.id ? 'text-(--color-accent)' : 'text-(--color-text-tertiary)'} />
                {item.label}
              </button>
            ))}
          </div>

          <div className="p-8">
            <Card className={`p-4 transition-all duration-500 border-none rounded-[20px] ${
              providerList.length > 0 
                ? 'bg-green-500/5' 
                : 'bg-red-500/5'
            }`}>
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${providerList.length > 0 ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className={`text-[10px] font-bold uppercase tracking-widest ${
                  providerList.length > 0 ? 'text-green-600' : 'text-red-500'
                }`}>
                  {providerList.length > 0 ? 'Kilo Core Active' : 'Kilo Core Offline'}
                </span>
              </div>
            </Card>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-(--color-bg) relative">
          {/* Header */}
          <header className="h-20 flex items-center justify-between px-10 shrink-0 bg-(--color-surface)/50 backdrop-blur-xl border-b border-(--color-border-light) z-10">
            <h3 className="text-lg font-bold text-(--color-text) tracking-tight">
              {activeTab === 'provider' && 'AI Model Providers'}
              {activeTab === 'mcp' && 'MCP Integration'}
              {activeTab === 'skills' && 'Skill Capabilities'}
              {activeTab === 'appearance' && 'Visual Interface'}
            </h3>
            <Button 
              onClick={onClose} 
              variant="ghost"
              size="icon"
              className="rounded-full hover:bg-(--color-surface-hover)"
            >
              <X size={20} />
            </Button>
          </header>

          {/* Content Area */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'provider' && (
              <div className="flex h-full">
                {/* Provider List */}
                <aside className="w-[320px] border-r border-(--color-border-light) flex flex-col bg-(--color-surface)/30 shrink-0">
                  <div className="p-6 border-b border-(--color-border-light) space-y-4">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[10px] font-bold text-(--color-text-tertiary) uppercase tracking-widest">
                        {providerList.length} Options
                      </span>
                      <Button
                        onClick={fetchProviders}
                        isDisabled={fetching}
                        variant="ghost"
                        size="sm"
                        className="text-(--color-accent) h-7"
                      >
                        <RefreshCw size={12} className={fetching ? 'animate-spin' : ''} />
                        Sync
                      </Button>
                    </div>
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filter providers..."
                      startContent={<Search size={14} className="text-(--color-text-tertiary)" />}
                      variant="primary"
                    />
                  </div>
                  
                  <ScrollShadow className="flex-1 p-3 space-y-1">
                    {filteredProviders.map((p) => {
                      const isActive = expandedProvider === p.id
                      const isConfigured = !!localConfigs[p.id]?.apiKey
                      return (
                        <button
                          key={p.id}
                          onClick={() => setExpandedProvider(p.id)}
                          className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-300 text-left ${
                            isActive ? 'bg-(--color-accent-muted) text-(--color-accent)' : 'text-(--color-text-secondary) hover:bg-(--color-surface-secondary)'
                          }`}
                        >
                          <div className={`p-2 rounded-xl transition-colors ${
                            isActive ? 'bg-(--color-accent) text-white' : 'bg-(--color-surface-secondary) text-(--color-text-tertiary)'
                          }`}>
                            <Cpu size={14} />
                          </div>
                          <span className="flex-1 text-sm font-semibold tracking-tight">{p.name}</span>
                          {isConfigured && (
                            <div className="w-5 h-5 rounded-full bg-green-500/10 flex items-center justify-center">
                              <Check size={10} className="text-green-500" />
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </ScrollShadow>
                </aside>

                {/* Provider Detail Form */}
                <ScrollShadow className="flex-1 p-10 bg-(--color-bg)">
                  {expandedProvider && provider && cfg ? (
                    <div className="max-w-xl mx-auto space-y-10 animate-fade-in">
                      <div className="flex items-center gap-4">
                        <div className="p-3.5 rounded-2xl bg-(--color-accent-muted) text-(--color-accent) shadow-sm">
                          <Cpu size={24} />
                        </div>
                        <div>
                          <h2 className="text-2xl font-bold text-(--color-text) tracking-tight">{provider.name}</h2>
                          <p className="text-xs text-(--color-text-tertiary) mt-1 font-medium italic opacity-70">Configure API credentials and operational parameters</p>
                        </div>
                      </div>

                      <div className="space-y-8 bg-(--color-surface) p-10 rounded-[32px] border border-(--color-border-light) shadow-xl shadow-black/[0.02]">
                        <div className="space-y-3">
                          <label className="text-[11px] font-bold uppercase tracking-widest text-(--color-text-tertiary) ml-1 opacity-70">
                            Authentication Token {envVar && <span className="opacity-50 lowercase ml-1 font-mono">({envVar})</span>}
                          </label>
                            <Input
                               type={showKey ? 'text' : 'password'}
                               value={cfg.apiKey}
                               onChange={(e) => handleConfigChange(expandedProvider, 'apiKey', e.target.value)}
                               placeholder="Enter API Key..."
                               variant="primary"
                               size="lg"
                               className="font-mono"
                               endContent={
                              <button
                                type="button"
                                onClick={() => setShowKey(!showKey)}
                                className="text-(--color-text-tertiary) hover:text-(--color-text) transition-colors"
                              >
                                {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                              </button>
                            }
                          />
                        </div>

                        <div className="space-y-3">
                          <label className="text-[11px] font-bold uppercase tracking-widest text-(--color-text-tertiary) ml-1 opacity-70">Deployment Model</label>
                          {modelKeys.length > 0 ? (
                            <Select
                              selectedKey={cfg.model}
                              onSelectionChange={(key: any) => {
                                if (key) handleConfigChange(expandedProvider, 'model', key as string);
                              }}
                              placeholder="Select a model"
                            >
                              <SelectTrigger className="w-full px-4 py-3 rounded-2xl bg-(--color-surface-secondary)/50 border border-(--color-border) outline-none focus:border-(--color-accent) text-sm font-semibold transition-all">
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
                            <Input
                              value={cfg.model}
                              onChange={(e) => handleConfigChange(expandedProvider, 'model', e.target.value)}
                              placeholder="e.g., gpt-4-turbo"
                              variant="primary"
                            />
                          )}
                        </div>

                        <div className="space-y-3">
                          <label className="text-[11px] font-bold uppercase tracking-widest text-(--color-text-tertiary) ml-1 opacity-70">Backend Endpoint (Optional)</label>
                          <Input
                            value={cfg.baseUrl || ''}
                            onChange={(e) => handleConfigChange(expandedProvider, 'baseUrl', e.target.value)}
                            placeholder="https://api.openai.com/v1"
                            variant="primary"
                            size="lg"
                            className="font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-12 opacity-30 animate-fade-in">
                      <div className="p-10 rounded-[48px] bg-(--color-surface-secondary) mb-8">
                        <Cpu size={64} className="text-(--color-text-tertiary)" />
                      </div>
                      <h4 className="text-xl font-bold text-(--color-text) tracking-tight">Intelligence Selection</h4>
                      <p className="text-sm text-(--color-text-tertiary) mt-2 max-w-xs font-medium leading-relaxed">Select a model provider from the sidebar to establish connection.</p>
                    </div>
                  )}
                </ScrollShadow>
              </div>
            )}

            {activeTab === 'appearance' && (
              <ScrollShadow className="p-16 max-w-3xl mx-auto animate-slide-up">
                <div className="space-y-12">
                  <div>
                    <h4 className="text-[11px] font-bold uppercase tracking-[0.2em] text-(--color-text-tertiary) mb-8 opacity-70">Interface Theme Architecture</h4>
                    <div className="grid grid-cols-2 gap-8">
                      {(['light', 'dark'] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setTheme(t)}
                          className={`flex flex-col items-center gap-6 p-10 rounded-[40px] border-2 transition-all duration-500 ${
                            theme === t 
                              ? 'border-(--color-accent) bg-(--color-accent-muted) shadow-2xl shadow-accent/10' 
                              : 'border-(--color-border) hover:border-(--color-border-hover) bg-(--color-surface)'
                          }`}
                        >
                          <div className={`p-6 rounded-[24px] ${theme === t ? 'bg-(--color-accent) text-white shadow-xl' : 'bg-(--color-surface-secondary) text-(--color-text-tertiary)'}`}>
                            {t === 'light' ? <Sun size={32} /> : <Moon size={32} />}
                          </div>
                          <span className={`text-base font-bold tracking-tight ${theme === t ? 'text-(--color-accent)' : 'text-(--color-text)'}`}>
                            {t.charAt(0).toUpperCase() + t.slice(1)} Mode
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </ScrollShadow>
            )}

            {activeTab === 'mcp' && <ScrollShadow className="p-10"><MCPSettings /></ScrollShadow>}
            {activeTab === 'skills' && <ScrollShadow className="p-10"><SkillSettings /></ScrollShadow>}
          </div>

          {/* Action Footer */}
          <footer className="h-24 px-10 border-t border-(--color-border-light) bg-(--color-surface)/30 backdrop-blur-md flex items-center justify-end gap-5 shrink-0 z-10">
            <Button 
              onClick={onClose} 
              variant="ghost"
              className="px-8 font-bold text-(--color-text-secondary)"
            >
              Dismiss
            </Button>
            <Button
              onClick={handleSave}
              isDisabled={saving}
              variant={saved ? 'ghost' : 'primary'}
              className={`min-w-[180px] h-12 rounded-2xl shadow-xl shadow-accent/10 transition-all duration-500 ${
                saved ? 'text-green-600 bg-green-500/5' : ''
              }`}
            >
              {saving ? <RefreshCw size={18} className="animate-spin" /> : saved ? <CheckCircle size={18} /> : <Save size={18} />}
              <span className="font-bold tracking-tight">
                {saved ? 'Settings Applied' : saving ? 'Synchronizing...' : 'Apply Configuration'}
              </span>
            </Button>
          </footer>
        </div>
      </div>
    </div>
  )
}
