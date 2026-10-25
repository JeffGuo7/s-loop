import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check, Cpu, Eye, EyeOff, Plus, RefreshCw, Search, Sparkles, Trash2 } from 'lucide-react'
import { ScrollShadow } from '@heroui/react'
import type { ProviderConfig, ProviderInfo } from '../../types'

export interface ProviderSettingsProps {
  providers: ProviderInfo[]
  localConfigs: Record<string, ProviderConfig>
  onChange: (id: string, field: string, value: string | boolean) => void
  expandedProvider: string | null
  setExpandedProvider: (id: string | null) => void
  customName: string
  setCustomName: (value: string) => void
  customAPI: string
  setCustomAPI: (value: string) => void
  addCustomProvider: (config: Partial<ProviderInfo> & { id: string; name: string; isCustom: true }) => void
  removeCustomProvider: (id: string) => void
}

export function ProviderSettings({
  providers,
  localConfigs,
  onChange,
  expandedProvider,
  setExpandedProvider,
  customName,
  setCustomName,
  customAPI,
  setCustomAPI,
  addCustomProvider,
  removeCustomProvider,
}: ProviderSettingsProps) {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [modelSearchQuery, setModelSearchQuery] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [providerModels, setProviderModels] = useState<Record<string, string[]>>({})
  const [showModelDropdown, setShowModelDropdown] = useState(false)

  const filteredProviders = useMemo(() => {
    if (!searchQuery) return providers
    const q = searchQuery.toLowerCase()
    return providers.filter((p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
  }, [providers, searchQuery])

  const provider = providers.find((p) => p.id === expandedProvider)
  const cfg = expandedProvider
    ? localConfigs[expandedProvider] || { apiKey: '', model: '', baseUrl: '', supportsVision: false }
    : null
  const modelsForProvider = expandedProvider ? providerModels[expandedProvider] || [] : []
  const filteredModels = useMemo(() => {
    if (!modelSearchQuery) return modelsForProvider
    const q = modelSearchQuery.toLowerCase()
    return modelsForProvider.filter((m) => m.toLowerCase().includes(q))
  }, [modelsForProvider, modelSearchQuery])
  const envVar = provider?.env || ''

  return (
    <div className="h-full flex flex-col">
      <ScrollShadow className="flex-1">
        <div className="max-w-4xl mx-auto px-8 py-7 space-y-8">
                    {!expandedProvider ? (
                      /* Provider Selection Grid */
                      <div className="space-y-6 animate-fade-in">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <h4 className="text-lg font-semibold text-text tracking-tight">{t('settings.sections.selectProvider')}</h4>
                            <p className="text-[13px] text-text-tertiary font-medium">{t('settings.descriptions.chooseProvider')}</p>
                          </div>
                          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-border focus-within:border-accent/50 transition-colors duration-150 w-60">
                            <Search size={14} className="text-text-quaternary" />
                            <input
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              placeholder={t('settings.provider.searchPlaceholder')}
                              className="bg-transparent text-[13px] font-bold text-text outline-none w-full"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {filteredProviders.map((p) => {
                            const isConfigured = !!localConfigs[p.id]?.apiKey
                            return (
                              <button
                                key={p.id}
                                onClick={() => setExpandedProvider(p.id)}
                                className="group relative p-4 rounded-lg bg-surface border border-border hover:border-accent/40 hover:bg-accent-subtle transition-colors duration-150 text-left"
                              >
                                <div className="flex items-center justify-between mb-4">
                                  <div className="p-2 rounded-md bg-surface-tertiary text-text-tertiary group-hover:text-accent transition-colors duration-150">
                                    <Cpu size={18} />
                                  </div>
                                  {isConfigured && (
                                    <div className="px-3 py-1 rounded-full bg-green-500/10 text-green-500 text-[10px] font-black uppercase tracking-widest border border-green-500/20">
                                      Active
                                    </div>
                                  )}
                                </div>
                                <h5 className="text-[14px] font-semibold text-text tracking-tight mb-1">{p.name}</h5>
                                <p className="text-[11px] text-text-tertiary font-medium">{p.id}</p>
                              </button>
                            )
                          })}
                          <button
                            onClick={() => {
                              const id = `custom-${Math.random().toString(36).substring(2, 6)}`
                              addCustomProvider({ id, name: 'Custom Provider', api: 'openai-completions', isCustom: true })
                              setExpandedProvider(id)
                            }}
                            className="group relative p-4 rounded-lg bg-accent/5 border border-dashed border-accent/30 hover:border-accent/60 hover:bg-accent-subtle transition-colors duration-150 text-left flex flex-col items-center justify-center gap-3"
                          >
                            <div className="p-2 rounded-md bg-accent/10 text-accent">
                              <Plus size={18} />
                            </div>
                            <div className="text-center">
                              <h5 className="text-[14px] font-semibold text-text tracking-tight mb-1">Add Custom Provider</h5>
                              <p className="text-[11px] text-text-tertiary font-medium">OpenAI-compatible</p>
                            </div>
                          </button>
                        </div>
                      </div>
                    ) : provider && cfg ? (
                      /* Focused Provider Configuration */
                      <div className="space-y-8 animate-fade-in">
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

                        <div className="flex items-center gap-5">
                          <div className="p-3 rounded-lg bg-accent-subtle text-accent border border-accent/20">
                            <Cpu size={26} />
                          </div>
                          <div className="flex-1">
                            {provider.isCustom ? (
                              <div className="space-y-3">
                                <input
                                  value={customName}
                                  onChange={(e) => setCustomName(e.target.value)}
                                  placeholder="Provider Name"
                                  className="w-full text-2xl font-semibold text-text tracking-tight bg-transparent border-b border-border outline-none placeholder:text-text-tertiary/40"
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
                                <h2 className="text-2xl font-semibold text-text tracking-[-0.03em] leading-tight">{provider.name}</h2>
                                <div className="flex items-center gap-3 mt-2">
                                  <span className="px-4 py-1.5 rounded-full bg-accent-muted text-accent text-[11px] font-black uppercase tracking-widest border border-accent/10">
                                    {provider.id}
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-7 pt-2">
                          {/* API Key Card */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between ml-2">
                              <label className="text-[11px] font-black uppercase tracking-[0.3em] text-text-tertiary opacity-50">API Access Token</label>
                              {envVar && <span className="text-[10px] font-mono text-accent/70 bg-accent-muted px-3 py-1 rounded-lg border border-accent/10">{envVar}</span>}
                            </div>
                            <div className="relative group">
                              <input
                                type={showKey ? 'text' : 'password'}
                                value={cfg.apiKey}
                                onChange={(e) => onChange(expandedProvider, 'apiKey', e.target.value)}
                                placeholder="Paste your API key here..."
                                className="control-field w-full px-4 py-3 pr-12 text-[13px] font-mono"
                              />
                              <button
                                type="button"
                                onClick={() => setShowKey(!showKey)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md text-text-tertiary hover:text-text hover:bg-surface-secondary transition-colors"
                              >
                                {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                              </button>
                            </div>
                          </div>

                          {/* Model Selection */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between ml-2">
                              <label className="text-[11px] font-black uppercase tracking-[0.3em] text-text-tertiary opacity-50">Model Engine</label>
                              <button
                                onClick={async () => {
                                  if (!expandedProvider) return
                                  const cfg = localConfigs[expandedProvider]
                                  const list = await import('../../utils/piClient').then(m =>
                                    m.fetchModels(
                                      expandedProvider,
                                      cfg?.apiKey,
                                      cfg?.baseUrl,
                                      provider?.api,
                                      cfg?.reasoningSupport,
                                      cfg?.thinkingFormat,
                                    ))
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
                                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors duration-150 ${
                                    showModelDropdown 
                                      ? 'bg-surface border-accent/50 ring-2 ring-accent/10'
                                      : 'bg-surface border-border hover:border-accent/30'
                                  }`}
                                >
                                  <div className="flex items-center gap-4">
                                    <Sparkles size={17} className={cfg.model ? 'text-accent' : 'text-text-tertiary opacity-40'} />
                                    <span className={`text-[13px] font-semibold ${cfg.model ? 'text-text' : 'text-text-tertiary'}`}>
                                      {cfg.model || t('settings.provider.chooseModel')}
                                    </span>
                                  </div>
                                  <RefreshCw size={18} className={`text-text-tertiary transition-transform duration-500 ${showModelDropdown ? 'rotate-180' : ''}`} />
                                </button>

                                {showModelDropdown && (
                                  <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowModelDropdown(false)} />
                                    <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-surface rounded-lg border border-border shadow-(--shadow-dialog) overflow-hidden animate-scale-in origin-top">
                                      <div className="p-3 border-b border-border">
                                        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-surface-secondary border border-border focus-within:border-accent/30 transition-colors">
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
                                                  onChange(expandedProvider, 'model', m)
                                                  setShowModelDropdown(false)
                                                }}
                                                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md transition-colors duration-150 group ${
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
                                onChange={(e) => onChange(expandedProvider, 'model', e.target.value)}
                                placeholder="e.g. claude-sonnet-4-20250514"
                                className="control-field w-full px-4 py-3 text-[13px] font-mono"
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
                          <div className="space-y-2">
                            <label className="text-[11px] font-black uppercase tracking-[0.3em] text-text-tertiary ml-2 opacity-50">{t('settings.provider.customGateway')}</label>
                            <input
                              value={cfg.baseUrl || ''}
                              onChange={(e) => onChange(expandedProvider, 'baseUrl', e.target.value)}
                              placeholder="https://your-custom-proxy.com/v1"
                              className="control-field w-full px-4 py-3 text-[13px] font-mono"
                            />
                          </div>

                          {/* Vision capability toggle */}
                          <div className="flex items-center gap-4 mt-2 ml-2">
                            <button
                              onClick={() => onChange(expandedProvider, 'supportsVision', !cfg.supportsVision)}
                              className={`relative w-11 h-6 rounded-full transition-all duration-300 ${
                                cfg.supportsVision ? 'bg-accent' : 'bg-surface-tertiary border border-border-light'
                              }`}
                            >
                              <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300 ${
                                cfg.supportsVision ? 'translate-x-5' : 'translate-x-0'
                              }`} />
                            </button>
                            <span className="text-[12px] font-bold tracking-tight text-text-secondary">
                              Supports Vision (Image Input)
                            </span>
                          </div>

                          {provider.isCustom && (
                            <div className="grid grid-cols-2 gap-4 border-t border-border pt-6">
                              <div className="space-y-2">
                                <label className="ml-2 text-[11px] font-black uppercase tracking-[0.2em] text-text-tertiary opacity-60">
                                  {t('settings.provider.reasoningSupport')}
                                </label>
                                <select
                                  value={cfg.reasoningSupport || 'auto'}
                                  onChange={(event) => onChange(expandedProvider, 'reasoningSupport', event.target.value)}
                                  className="control-field w-full px-4 py-3 text-[13px]"
                                >
                                  <option value="auto">{t('settings.provider.reasoningAuto')}</option>
                                  <option value="enabled">{t('settings.provider.reasoningEnabled')}</option>
                                  <option value="disabled">{t('settings.provider.reasoningDisabled')}</option>
                                </select>
                              </div>
                              <div className="space-y-2">
                                <label className="ml-2 text-[11px] font-black uppercase tracking-[0.2em] text-text-tertiary opacity-60">
                                  {t('settings.provider.thinkingFormat')}
                                </label>
                                <select
                                  value={cfg.thinkingFormat || 'auto'}
                                  onChange={(event) => onChange(expandedProvider, 'thinkingFormat', event.target.value)}
                                  className="control-field w-full px-4 py-3 text-[13px]"
                                >
                                  {['auto', 'openai', 'openrouter', 'deepseek', 'qwen', 'together', 'zai'].map((format) => (
                                    <option key={format} value={format}>{format}</option>
                                  ))}
                                </select>
                              </div>
                              <p className="col-span-2 px-2 text-[11px] leading-relaxed text-text-tertiary">
                                {t('settings.provider.reasoningCompatibilityHint')}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
        </div>
      </ScrollShadow>
    </div>
  )
}
