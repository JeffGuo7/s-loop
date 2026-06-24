import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../stores'
import { X, Cpu, Eye, EyeOff, Server, Sparkles, RefreshCw, Search, CheckCircle, Check, Sun, Moon, AlertTriangle, Globe, Plus, Trash2 } from 'lucide-react'
import type { ProviderConfig, ProviderInfo } from '../../types'
import { MCPSettings } from '../mcp'
import { SkillSettings } from '../skills'
import { WebSearchSettings } from '../websearch'
import { ScrollShadow } from "@heroui/react"
import i18n from '../../i18n'
import { COLOR_SCHEMES } from '../../themes'

interface SettingsModalProps {
  onClose: () => void
}

const BUILT_IN_PROVIDERS: ProviderInfo[] = [
  { id: 'opencode', name: 'OpenCode (Anthropic)', env: 'OPENCODE_API_KEY', source: 'https://api.opencode.ai/v1' },
  { id: 'opencode-go', name: 'OpenCode Go (OpenAI)', env: 'OPENCODE_GO_API_KEY', source: 'https://opencode.ai/zen/go/v1' },
  { id: 'anthropic', name: 'Anthropic', env: 'ANTHROPIC_API_KEY', source: 'https://api.anthropic.com' },
  { id: 'openai', name: 'OpenAI', env: 'OPENAI_API_KEY', source: 'https://api.openai.com/v1' },
  { id: 'gemini', name: 'Google Gemini', env: 'GEMINI_API_KEY', source: 'https://generativelanguage.googleapis.com' },
  { id: 'deepseek', name: 'DeepSeek', env: 'DEEPSEEK_API_KEY', source: 'https://api.deepseek.com' },
  { id: 'groq', name: 'Groq', env: 'GROQ_API_KEY', source: 'https://api.groq.com/openai/v1' },
  { id: 'openrouter', name: 'OpenRouter', env: 'OPENROUTER_API_KEY', source: 'https://openrouter.ai/api/v1' },
  { id: 'mistral', name: 'Mistral', env: 'MISTRAL_API_KEY', source: 'https://api.mistral.ai/v1' },
  { id: 'xai', name: 'xAI (Grok)', env: 'XAI_API_KEY', source: 'https://api.x.ai/v1' },
  { id: 'github-copilot', name: 'GitHub Copilot', env: 'GITHUB_TOKEN', source: 'https://api.githubcopilot.com' },
  { id: 'huggingface', name: 'HuggingFace', env: 'HUGGINGFACE_API_KEY', source: 'https://api-inference.huggingface.co' },
  { id: 'fireworks', name: 'Fireworks AI', env: 'FIREWORKS_API_KEY', source: 'https://api.fireworks.ai/inference/v1' },
  { id: 'together', name: 'Together AI', env: 'TOGETHER_API_KEY', source: 'https://api.together.xyz/v1' },
  { id: 'cerebras', name: 'Cerebras', env: 'CEREBRAS_API_KEY', source: 'https://api.cerebras.ai/v1' },
  { id: 'zai', name: 'Z AI', env: 'ZAI_API_KEY', source: 'https://api.z.ai/v1' },
  { id: 'perplexity', name: 'Perplexity', env: 'PERPLEXITY_API_KEY', source: 'https://api.perplexity.ai' },
  { id: 'minimax', name: 'MiniMax', env: 'MINIMAX_API_KEY', source: 'https://api.minimax.chat/v1' },
  { id: 'moonshotai', name: 'Moonshot AI', env: 'MOONSHOT_API_KEY', source: 'https://api.moonshot.cn/v1' },
  { id: 'nvidia', name: 'NVIDIA AI', env: 'NVIDIA_API_KEY', source: 'https://integrate.api.nvidia.com/v1' },
  { id: 'hyperbolic', name: 'Hyperbolic', env: 'HYPERBOLIC_API_KEY', source: 'https://api.hyperbolic.xyz/v1' },
  { id: 'jina', name: 'Jina AI', env: 'JINA_API_KEY', source: 'https://api.jina.ai/v1' },
  { id: 'voyageai', name: 'Voyage AI', env: 'VOYAGEAI_API_KEY', source: 'https://api.voyageai.com/v1' },
  { id: 'kimi-coding', name: 'Kimi (Moonshot)', env: 'KIMI_API_KEY', source: 'https://api.moonshot.cn/v1' },
  { id: 'ollama', name: 'Ollama (Local)', env: 'OLLAMA_API_KEY', source: 'http://localhost:11434/v1' },
  { id: 'lmstudio', name: 'LM Studio (Local)', env: 'LMSTUDIO_API_KEY', source: 'http://localhost:1234/v1' },
  { id: 'custom', name: 'Custom Provider', env: '', source: '' },
]

export function SettingsModal({ onClose }: SettingsModalProps) {
  const {
    activeProvider,
    setActiveProvider,
    providerConfigs,
    setProviderConfig,
    providerList,
    setProviderList,
    customProviders,
    addCustomProvider,
    updateCustomProvider,
    removeCustomProvider,
    theme,
    setTheme,
    colorScheme,
    setColorScheme,
    locale,
    setLocale,
  } = useAppStore()

  const { t } = useTranslation()

  const [showKey, setShowKey] = useState(false)
  const [activeTab, setActiveTab] = useState('provider')
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null)
  const [localConfigs, setLocalConfigs] = useState<Record<string, ProviderConfig>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [modelSearchQuery, setModelSearchQuery] = useState('')
  const [missingModelWarning, setMissingModelWarning] = useState(false)
  const [providerModels, setProviderModels] = useState<Record<string, string[]>>({})

  // Custom provider local state
  const [customName, setCustomName] = useState('')
  const [customAPI, setCustomAPI] = useState('openai-completions')

  // Set provider list (built-ins merged with custom registry)
  useEffect(() => {
    setProviderList(BUILT_IN_PROVIDERS)
  }, [setProviderList, customProviders])

  // Sync local configs from store on open
  useEffect(() => {
    setLocalConfigs({ ...providerConfigs })
    const ep = activeProvider || null
    setExpandedProvider(ep && providerList.some(p => p.id === ep) ? ep : null)
    setModelSearchQuery('')
  }, [activeProvider, providerConfigs, providerList])

  // Auto-fill default base URL when expanding a provider
  useEffect(() => {
    if (!expandedProvider) return
    const info = providerList.find(p => p.id === expandedProvider)
    const cfg = localConfigs[expandedProvider]
    if (info?.source && (!cfg || !cfg.baseUrl)) {
      handleConfigChange(expandedProvider, 'baseUrl', info.source)
    }
    if (info?.isCustom) {
      setCustomName(info.name || '')
      setCustomAPI(info.api || 'openai-completions')
    } else {
      setCustomName('')
      setCustomAPI('openai-completions')
    }
  }, [expandedProvider])

  const handleConfigChange = (id: string, field: string, value: string) => {
    setLocalConfigs((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || { apiKey: '', model: '', baseUrl: '' }), [field]: value },
    }))
  }

  const handleSave = async () => {
    for (const [id, cfg] of Object.entries(localConfigs)) {
      setProviderConfig(id, cfg)
    }
    if (provider?.isCustom && expandedProvider) {
      updateCustomProvider(expandedProvider, { name: customName, api: customAPI, source: localConfigs[expandedProvider]?.baseUrl || provider.source })
    }
    setActiveProvider(expandedProvider || activeProvider)

    setSaving(true)
    // Simulate save delay for UX
    await new Promise(r => setTimeout(r, 300))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)

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

  const modelsForProvider = expandedProvider ? (providerModels[expandedProvider] || []) : []

  const filteredModels = useMemo(() => {
    if (!modelSearchQuery) return modelsForProvider
    const q = modelSearchQuery.toLowerCase()
    return modelsForProvider.filter(m => m.toLowerCase().includes(q))
  }, [modelsForProvider, modelSearchQuery])

  const [showModelDropdown, setShowModelDropdown] = useState(false)

  const envVar = provider?.env || ''

  return createPortal(
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 sm:p-12 bg-black/50 backdrop-blur-xl animate-fade-in">
      <div className="w-full max-w-6xl h-[85vh] flex flex-row bg-bg shadow-[0_24px_80px_rgba(0,0,0,0.3)] rounded-[32px] border border-border-light animate-scale-in relative overflow-hidden">
        
        {/* Settings Sidebar */}
        <aside className="w-[300px] bg-linear-to-b from-surface-secondary/90 to-surface-tertiary/90 border-r border-border flex flex-col shrink-0 relative backdrop-blur-3xl">
          <div className="px-12 pt-20 pb-12 relative z-10">
            <h2 className="text-6xl font-bold text-text tracking-tighter leading-none drop-shadow-sm">{t('settings.title')}</h2>
            <p className="text-[11px] text-accent font-bold uppercase tracking-[0.5em] mt-4 opacity-50">{t('settings.subtitle')}</p>
          </div>

          <nav className="flex-1 px-8 pt-4 space-y-4 overflow-y-auto scrollbar-subtle">
            {[
              { id: 'provider', icon: Cpu, label: t('settings.tabs.aiProviders') },
              { id: 'mcp', icon: Server, label: t('settings.tabs.mcpServers') },
              { id: 'skills', icon: Sparkles, label: t('settings.tabs.skills') },
              { id: 'websearch', icon: Globe, label: t('settings.tabs.webSearch') },
              { id: 'appearance', icon: theme === 'light' ? Sun : Moon, label: t('settings.tabs.appearance') },
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
                <div className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.6)]" />
                <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-30" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-green-600/90">
                {t('settings.kilostatus.online')}
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
                {activeTab === 'provider' && t('settings.sections.aiModelProviders')}
                {activeTab === 'mcp' && t('settings.sections.mcpServers')}
                {activeTab === 'skills' && t('settings.sections.skills')}
                {activeTab === 'websearch' && t('settings.sections.webSearch')}
                {activeTab === 'appearance' && t('settings.sections.appearance')}
              </h3>
              <p className="text-[14px] text-text-tertiary font-medium mt-1 tracking-tight opacity-70">{t('settings.descriptions.manageSettings', { tab: activeTab })}</p>
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
                <ScrollShadow className="flex-1">
                  <div className="max-w-4xl mx-auto px-12 py-12 space-y-12">
                    
                    {!expandedProvider ? (
                      /* Provider Selection Grid */
                      <div className="space-y-10 animate-fade-in">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <h4 className="text-2xl font-bold text-text tracking-tight">{t('settings.sections.selectProvider')}</h4>
                            <p className="text-[13px] text-text-tertiary font-medium">{t('settings.descriptions.chooseProvider')}</p>
                          </div>
                          <div className="flex items-center gap-4 px-5 py-2.5 rounded-2xl bg-surface-secondary/50 border border-border-light focus-within:border-accent/50 transition-all duration-300 w-64">
                            <Search size={14} className="text-text-quaternary" />
                            <input
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              placeholder={t('settings.provider.searchPlaceholder')}
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
                                <p className="text-[11px] text-text-tertiary font-bold uppercase tracking-widest opacity-50">{p.id}</p>
                              </button>
                            )
                          })}
                          <button
                            onClick={() => {
                              const id = `custom-${Math.random().toString(36).substring(2, 6)}`
                              addCustomProvider({ id, name: 'Custom Provider', api: 'openai-completions', isCustom: true })
                              setExpandedProvider(id)
                            }}
                            className="group relative p-8 rounded-[32px] bg-accent/5 dark:bg-accent/5 border border-dashed border-accent/30 hover:border-accent/60 hover:bg-accent-subtle transition-all duration-500 text-left shadow-sm hover:shadow-xl hover:-translate-y-1 flex flex-col items-center justify-center gap-4"
                          >
                            <div className="p-4 rounded-2xl bg-accent/10 text-accent group-hover:bg-accent group-hover:text-white transition-all duration-500 shadow-sm">
                              <Plus size={24} />
                            </div>
                            <div className="text-center">
                              <h5 className="text-[17px] font-bold text-text tracking-tight mb-1">Add Custom Provider</h5>
                              <p className="text-[11px] text-text-tertiary font-bold uppercase tracking-widest opacity-50">OpenAI-compatible</p>
                            </div>
                          </button>
                        </div>
                      </div>
                    ) : provider && cfg ? (
                      /* Focused Provider Configuration */
                      <div className="space-y-12 animate-fade-in-up">
                        <div className="flex items-center justify-between">
                          <button
                            onClick={() => setExpandedProvider(null)}
                            className="flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.2em] text-text-tertiary hover:text-accent transition-colors"
                          >
                            <RefreshCw size={14} className="rotate-180" />
                            {t('settings.provider.backToList')}
                          </button>
                          {provider.isCustom && (
                            <button
                              onClick={() => {
                                removeCustomProvider(provider.id)
                                setExpandedProvider(null)
                              }}
                              className="flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.2em] text-red-500/70 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={14} />
                              Delete
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-8">
                          <div className="p-8 rounded-[32px] bg-accent text-accent-foreground shadow-2xl shadow-accent/20">
                            <Cpu size={48} />
                          </div>
                          <div className="flex-1">
                            {provider.isCustom ? (
                              <div className="space-y-3">
                                <input
                                  value={customName}
                                  onChange={(e) => setCustomName(e.target.value)}
                                  placeholder="Provider Name"
                                  className="w-full text-3xl font-bold text-text tracking-tighter bg-transparent border-b border-border-light outline-none placeholder:text-text-tertiary/30"
                                />
                                <div className="flex items-center gap-3">
                                  <code className="px-3 py-1 rounded-lg bg-surface-secondary text-[12px] font-mono text-text-secondary border border-border-light">{provider.id}</code>
                                  <select
                                    value={customAPI}
                                    onChange={(e) => setCustomAPI(e.target.value)}
                                    className="px-3 py-1.5 rounded-xl bg-surface-secondary border border-border-light text-[12px] font-bold text-text-secondary outline-none"
                                  >
                                    <option value="openai-completions">openai-completions</option>
                                    <option value="openai-responses">openai-responses</option>
                                    <option value="openai-codex-responses">openai-codex-responses</option>
                                    <option value="anthropic-messages">anthropic-messages</option>
                                    <option value="mistral-conversations">mistral-conversations</option>
                                    <option value="google-generative-ai">google-generative-ai</option>
                                  </select>
                                </div>
                              </div>
                            ) : (
                              <>
                                <h2 className="text-5xl font-bold text-text tracking-tighter leading-tight">{provider.name}</h2>
                                <div className="flex items-center gap-3 mt-2">
                                  <span className="px-4 py-1.5 rounded-full bg-accent-muted text-accent text-[11px] font-black uppercase tracking-widest border border-accent/10">
                                    {provider.id}
                                  </span>
                                </div>
                              </>
                            )}
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

                          {/* Model Selection */}
                          <div className="space-y-6">
                            <div className="flex items-center justify-between ml-2">
                              <label className="text-[11px] font-black uppercase tracking-[0.3em] text-text-tertiary opacity-50">Model Engine</label>
                              <button
                                onClick={async () => {
                                  if (!expandedProvider) return
                                  const cfg = localConfigs[expandedProvider]
                                  const list = await import('../../utils/piClient').then(m =>
                                    m.fetchModels(expandedProvider, cfg?.apiKey, cfg?.baseUrl, provider?.api))
                                  if (list.length > 0) {
                                    setProviderModels(prev => ({ ...prev, [expandedProvider]: list.map(m => m.id) }))
                                  }
                                }}
                                className="text-[10px] font-bold uppercase tracking-widest text-accent/60 hover:text-accent transition-colors px-3 py-1 rounded-lg hover:bg-accent-muted"
                              >
                                Fetch Models
                              </button>
                            </div>
                            
                            {modelsForProvider.length > 0 ? (
                              <div className="relative">
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
                                      {cfg.model || t('settings.provider.chooseModel')}
                                    </span>
                                  </div>
                                  <RefreshCw size={18} className={`text-text-tertiary transition-transform duration-500 ${showModelDropdown ? 'rotate-180' : ''}`} />
                                </button>

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
                                            placeholder={t('settings.provider.filterModels')}
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
                                                  handleConfigChange(expandedProvider, 'model', m)
                                                  setShowModelDropdown(false)
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
                            ) : (
                              <input
                                value={cfg.model || ''}
                                onChange={(e) => handleConfigChange(expandedProvider, 'model', e.target.value)}
                                placeholder="e.g. claude-sonnet-4-20250514"
                                className="w-full px-8 py-6 rounded-[28px] bg-white/40 dark:bg-white/5 border border-border-light text-[15px] font-mono text-text outline-none focus:bg-white/80 dark:focus:bg-white/10 focus:border-accent/50 focus:ring-[16px] focus:ring-accent-subtle transition-all duration-500 shadow-sm"
                              />
                            )}
                            
                            {cfg.apiKey && !cfg.model && (
                              <div className="flex items-center gap-2 ml-4 text-amber-500 text-[12px] font-black uppercase tracking-widest animate-fade-in">
                                <AlertTriangle size={14} />
                                <span>Missing Model Engine</span>
                              </div>
                            )}
                          </div>

                          {/* Gateway Card */}
                          <div className="space-y-6">
                            <label className="text-[11px] font-black uppercase tracking-[0.3em] text-text-tertiary ml-2 opacity-50">{t('settings.provider.customGateway')}</label>
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
                      <h4 className="text-[11px] font-bold uppercase tracking-[0.3em] text-accent mb-4 opacity-60">{t('settings.sections.visualStyle')}</h4>
                      <h2 className="text-4xl font-bold text-text tracking-tighter">{t('settings.sections.interfaceTheme')}</h2>
                      <p className="text-[15px] text-text-tertiary mt-2 font-medium opacity-70 tracking-tight">{t('settings.descriptions.customizeLook')}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-8">
                      {(['light', 'dark'] as const).map((th) => (
                        <button
                          key={th}
                          onClick={() => setTheme(th)}
                          className={`group relative flex flex-col items-center gap-8 p-12 rounded-[40px] border-2 transition-all duration-700 ${
                            theme === th 
                              ? 'border-accent bg-accent-subtle shadow-[0_24px_80px_rgba(var(--color-accent-rgb),0.15)] -translate-y-2' 
                              : 'border-border-light hover:border-border-hover bg-surface hover:-translate-y-1 shadow-sm'
                          }`}
                        >
                          <div className={`p-8 rounded-[24px] transition-all duration-700 ${
                            theme === th 
                              ? 'bg-accent text-accent-foreground shadow-2xl shadow-accent/50' 
                              : 'bg-surface-secondary text-text-tertiary group-hover:text-text group-hover:bg-surface-tertiary'
                          }`}>
                            {th === 'light' ? <Sun size={40} /> : <Moon size={40} />}
                          </div>
                          <div className="text-center">
                            <span className={`text-2xl font-bold tracking-tighter block ${
                              theme === th ? 'text-accent' : 'text-text'
                            }`}>
                              {th === 'light' ? t('settings.theme.daylight') : t('settings.theme.midnight')}
                            </span>
                            <span className="text-[11px] text-text-tertiary font-bold uppercase tracking-[0.25em] mt-2 block opacity-40">
                              {th === 'light' ? t('settings.theme.cleanCrisp') : t('settings.theme.deepFocused')}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Color Scheme Picker */}
                    <div className="mt-12 pt-12 border-t border-border-light">
                      <div className="flex flex-col mb-8">
                        <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-accent mb-4 opacity-60">Color Palette</span>
                        <h4 className="text-2xl font-bold text-text tracking-tighter">{t('settings.appearance.colorScheme')}</h4>
                        <p className="text-[13px] text-text-tertiary mt-1 font-medium opacity-70">{t('settings.appearance.colorSchemeDesc')}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-5">
                        {COLOR_SCHEMES.map((scheme) => (
                          <button
                            key={scheme.id}
                            onClick={() => setColorScheme(scheme.id)}
                            className={`group relative flex flex-col items-center gap-5 p-8 rounded-[32px] border-2 transition-all duration-500 ${
                              colorScheme === scheme.id
                                ? 'border-accent bg-accent-subtle shadow-[0_16px_48px_rgba(var(--color-accent-rgb),0.12)] -translate-y-1'
                                : 'border-border-light hover:border-border-hover bg-surface hover:-translate-y-0.5 shadow-sm'
                            }`}
                          >
                            {/* Color swatch preview */}
                            <div className={`p-6 rounded-[20px] transition-all duration-500 border-2 ${
                              colorScheme === scheme.id
                                ? 'border-accent/30 shadow-xl'
                                : 'border-transparent group-hover:shadow-md'
                            }`}
                              style={{ backgroundColor: scheme.previewColor + '15' }}
                            >
                              <div className="flex gap-2">
                                <div
                                  className="w-8 h-8 rounded-full shadow-lg ring-2 ring-white/20"
                                  style={{ backgroundColor: scheme.previewColor }}
                                />
                                <div
                                  className="w-8 h-8 rounded-full opacity-50 shadow-lg"
                                  style={{ backgroundColor: scheme.previewColor }}
                                />
                                <div
                                  className="w-8 h-8 rounded-full opacity-25 shadow-lg"
                                  style={{ backgroundColor: scheme.previewColor }}
                                />
                              </div>
                            </div>
                            <div className="text-center">
                              <span className={`text-[16px] font-bold tracking-tight block ${
                                colorScheme === scheme.id ? 'text-accent' : 'text-text'
                              }`}>
                                {locale.startsWith('zh') ? scheme.nameZh : scheme.name}
                              </span>
                              <span className="text-[11px] text-text-tertiary font-medium tracking-wide mt-1 block opacity-50">
                                {scheme.name}
                              </span>
                            </div>
                            {colorScheme === scheme.id && (
                              <CheckCircle size={18} className="absolute top-4 right-4 text-accent animate-fade-in" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="mt-12 pt-12 border-t border-border-light">
                      <div className="flex flex-col mb-8">
                        <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-accent mb-4 opacity-60">{t('settingsLocale.language')}</span>
                      </div>
                      <div className="flex gap-4">
                        {['en', 'zh'].map((l) => (
                          <button
                            key={l}
                            onClick={() => {
                              setLocale(l)
                              i18n.changeLanguage(l)
                            }}
                            className={`flex-1 py-6 px-8 rounded-[32px] border-2 text-center transition-all duration-700 ${
                              locale === l
                                ? 'border-accent bg-accent-subtle shadow-lg'
                                : 'border-border-light hover:border-accent/30 bg-surface/50'
                            }`}
                          >
                            <span className={`text-xl font-bold block ${locale === l ? 'text-accent' : 'text-text'}`}>
                              {l === 'en' ? 'English' : '中文'}
                            </span>
                          </button>
                        ))}
                      </div>
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
            {activeTab === 'websearch' && (
              <ScrollShadow className="h-full px-16 py-12">
                <WebSearchSettings />
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
              {t('settings.buttons.cancel')}
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
                {saved ? t('settings.buttons.changesApplied') : saving ? t('settings.buttons.syncing') : t('settings.buttons.applySave')}
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
