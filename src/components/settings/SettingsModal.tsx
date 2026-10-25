import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../stores'
import { X, Cpu, Server, Sparkles, RefreshCw, CheckCircle, Sun, Moon, AlertTriangle, Globe, Mic } from 'lucide-react'
import type { ProviderConfig, ProviderInfo } from '../../types'
import { MCPSettings } from '../mcp'
import { ProviderSettings } from './ProviderSettings'
import { SkillSettings } from '../skills'
import { WebSearchSettings } from '../websearch'
import { ScrollShadow } from "@heroui/react"
import i18n from '../../i18n'
import { COLOR_SCHEMES } from '../../themes'
import { VoiceInputSettings } from './VoiceInputSettings'
import * as Pi from '../../utils/piClient'

interface SettingsModalProps {
  onClose: () => void
  initialTab?: string
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

// Friendly names for pi-catalog providers that have no curated entry above.
const PROVIDER_NAME_OVERRIDES: Record<string, string> = {
  google: 'Google Gemini',
  'google-vertex': 'Google Vertex AI',
  'amazon-bedrock': 'Amazon Bedrock',
  'azure-openai-responses': 'Azure OpenAI',
  'openai-codex': 'OpenAI Codex',
  'cloudflare-ai-gateway': 'Cloudflare AI Gateway',
  'cloudflare-workers-ai': 'Cloudflare Workers AI',
  'vercel-ai-gateway': 'Vercel AI Gateway',
  'ant-ling': 'Ant Group (Ling)',
  'minimax-cn': 'MiniMax (CN)',
  'moonshotai-cn': 'Moonshot AI (CN)',
  'qwen-token-plan': 'Qwen (Coding Plan)',
  'qwen-token-plan-cn': 'Qwen (CN Coding Plan)',
  xiaomi: 'Xiaomi AI',
  'zai-coding-cn': 'Z AI Coding (CN)',
}

function prettifyProviderId(id: string): string {
  return id.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export function SettingsModal({ onClose, initialTab = 'provider' }: SettingsModalProps) {
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

  const [activeTab, setActiveTab] = useState(initialTab)
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null)
  const [localConfigs, setLocalConfigs] = useState<Record<string, ProviderConfig>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [missingModelWarning, setMissingModelWarning] = useState(false)

  // Custom provider local state
  const [customName, setCustomName] = useState('')
  const [customAPI, setCustomAPI] = useState('openai-completions')

  // Set provider list (built-ins merged with custom registry)
  useEffect(() => {
    setProviderList(BUILT_IN_PROVIDERS)
  }, [setProviderList, customProviders])

  // Overlay the pi SDK's live provider catalog so the picker stays in sync
  // with the bundled SDK (new providers appear without frontend changes).
  useEffect(() => {
    let cancelled = false
    Pi.fetchProviders().then((catalog) => {
      if (cancelled || !Array.isArray(catalog) || catalog.length === 0) return
      const dynamic: ProviderInfo[] = catalog.map((entry) => ({
        id: entry.id,
        name: PROVIDER_NAME_OVERRIDES[entry.id] ?? prettifyProviderId(entry.id),
        env: `${entry.id.toUpperCase().replace(/-/g, '_')}_API_KEY`,
        source: entry.baseUrl || '',
        api: entry.api || undefined,
      }))
      const curatedIds = new Set(BUILT_IN_PROVIDERS.map((b) => b.id))
      setProviderList([...BUILT_IN_PROVIDERS, ...dynamic.filter((d) => !curatedIds.has(d.id))])
    }).catch(() => { /* keep curated list on failure */ })
    return () => { cancelled = true }
  }, [setProviderList])

  // Sync local configs from store on open
  useEffect(() => {
    setLocalConfigs({ ...providerConfigs })
    const ep = activeProvider || null
    setExpandedProvider(ep && providerList.some(p => p.id === ep) ? ep : null)
  }, [activeProvider, providerConfigs])

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

  const handleConfigChange = (id: string, field: string, value: string | boolean) => {
    setLocalConfigs((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || { apiKey: '', model: '', baseUrl: '', supportsVision: false }), [field]: value },
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


  const provider = providerList.find((p) => p.id === expandedProvider)





  return createPortal(
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 sm:p-8 bg-black/45 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-[1120px] h-[min(820px,90vh)] flex flex-row bg-bg shadow-(--shadow-dialog) rounded-xl border border-border animate-scale-in relative overflow-hidden">
        
        {/* Settings Sidebar */}
        <aside className="w-[232px] bg-surface-secondary border-r border-border flex flex-col shrink-0 relative">
          <div className="px-6 pt-7 pb-6 relative z-10">
            <p className="section-eyebrow mb-2">{t('settings.subtitle')}</p>
            <h2 className="text-[24px] font-semibold text-text tracking-[-0.03em] leading-tight">{t('settings.title')}</h2>
          </div>

          <nav className="flex-1 px-3 space-y-1 overflow-y-auto scrollbar-subtle">
            {[
              { id: 'provider', icon: Cpu, label: t('settings.tabs.aiProviders') },
              { id: 'mcp', icon: Server, label: t('settings.tabs.mcpServers') },
              { id: 'skills', icon: Sparkles, label: t('settings.tabs.skills') },
              { id: 'websearch', icon: Globe, label: t('settings.tabs.webSearch') },
              { id: 'voice', icon: Mic, label: i18n.resolvedLanguage?.startsWith('zh') ? '语音输入' : 'Voice Input' },
              { id: 'appearance', icon: theme === 'light' ? Sun : Moon, label: t('settings.tabs.appearance') },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-colors duration-150 group relative ${
                  activeTab === item.id
                    ? 'text-accent'
                    : 'text-text-secondary hover:bg-surface-tertiary/70 hover:text-text'
                }`}
              >
                {activeTab === item.id && (
                  <motion.div 
                    layoutId="activeTab"
                    className="absolute inset-0 bg-accent-subtle rounded-lg border border-accent/20"
                  />
                )}
                <item.icon size={17} className={`relative z-10 transition-colors duration-150 ${activeTab === item.id ? 'text-accent' : 'text-text-tertiary group-hover:text-text-secondary'}`} />
                <span className="relative z-10">{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="px-4 pb-4 pt-3">
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface border border-border">
              <div className="relative">
                <div className="w-2 h-2 rounded-full bg-green-500" />
              </div>
              <span className="text-[11px] font-semibold text-text-secondary">
                {t('settings.kilostatus.online')}
              </span>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-bg">
          {/* Header */}
          <header className="shrink-0 flex items-center justify-between px-8 h-[76px] border-b border-border">
            <div className="flex flex-col">
              <h3 className="text-xl font-semibold text-text tracking-[-0.02em]">
                {activeTab === 'provider' && t('settings.sections.aiModelProviders')}
                {activeTab === 'mcp' && t('settings.sections.mcpServers')}
                {activeTab === 'skills' && t('settings.sections.skills')}
                {activeTab === 'websearch' && t('settings.sections.webSearch')}
                {activeTab === 'voice' && (i18n.resolvedLanguage?.startsWith('zh') ? '本地语音输入' : 'Local Voice Input')}
                {activeTab === 'appearance' && t('settings.sections.appearance')}
              </h3>
              <p className="text-[12px] text-text-tertiary mt-1">{t('settings.descriptions.manageSettings', { tab: activeTab })}</p>
            </div>
            <button
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-surface-secondary text-text-tertiary hover:text-text hover:bg-surface-tertiary transition-colors duration-150 border border-border"
            >
              <X size={18} />
            </button>
          </header>

          {/* Content Area */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'provider' && (
              <ProviderSettings
                providers={providerList}
                localConfigs={localConfigs}
                onChange={handleConfigChange}
                expandedProvider={expandedProvider}
                setExpandedProvider={setExpandedProvider}
                customName={customName}
                setCustomName={setCustomName}
                customAPI={customAPI}
                setCustomAPI={setCustomAPI}
                addCustomProvider={addCustomProvider}
                removeCustomProvider={removeCustomProvider}
              />
            )}

            {activeTab === 'appearance' && (
              <ScrollShadow className="h-full px-8 py-7 animate-fade-in">
                <div className="max-w-3xl mx-auto">
                  <div className="mb-8">
                    <div className="flex flex-col mb-6">
                      <h4 className="section-eyebrow mb-2">{t('settings.sections.visualStyle')}</h4>
                      <h2 className="text-xl font-semibold text-text tracking-[-0.02em]">{t('settings.sections.interfaceTheme')}</h2>
                      <p className="text-[13px] text-text-tertiary mt-1">{t('settings.descriptions.customizeLook')}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {(['light', 'dark'] as const).map((th) => (
                        <button
                          key={th}
                          onClick={() => setTheme(th)}
                          className={`group relative flex items-center gap-4 p-4 rounded-lg border transition-colors duration-150 ${
                            theme === th 
                              ? 'border-accent bg-accent-subtle'
                              : 'border-border hover:border-border-hover bg-surface'
                          }`}
                        >
                          <div className={`p-2.5 rounded-lg transition-colors duration-150 ${
                            theme === th 
                              ? 'bg-accent text-accent-foreground'
                              : 'bg-surface-secondary text-text-tertiary group-hover:text-text group-hover:bg-surface-tertiary'
                          }`}>
                            {th === 'light' ? <Sun size={21} /> : <Moon size={21} />}
                          </div>
                          <div className="text-left">
                            <span className={`text-[14px] font-semibold block ${
                              theme === th ? 'text-accent' : 'text-text'
                            }`}>
                              {th === 'light' ? t('settings.theme.daylight') : t('settings.theme.midnight')}
                            </span>
                            <span className="text-[11px] text-text-tertiary mt-0.5 block">
                              {th === 'light' ? t('settings.theme.cleanCrisp') : t('settings.theme.deepFocused')}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Color Scheme Picker */}
                    <div className="mt-8 pt-7 border-t border-border">
                      <div className="flex flex-col mb-5">
                        <span className="section-eyebrow mb-2">Color Palette</span>
                        <h4 className="text-lg font-semibold text-text tracking-tight">{t('settings.appearance.colorScheme')}</h4>
                        <p className="text-[13px] text-text-tertiary mt-1 font-medium opacity-70">{t('settings.appearance.colorSchemeDesc')}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        {COLOR_SCHEMES.map((scheme) => (
                          <button
                            key={scheme.id}
                            onClick={() => setColorScheme(scheme.id)}
                            className={`group relative flex items-center gap-3 p-3 rounded-lg border transition-colors duration-150 ${
                              colorScheme === scheme.id
                                ? 'border-accent bg-accent-subtle'
                                : 'border-border hover:border-border-hover bg-surface'
                            }`}
                          >
                            {/* Color swatch preview */}
                            <div className={`shrink-0 p-1.5 rounded-md transition-colors duration-150 border ${
                              colorScheme === scheme.id
                                ? 'border-accent/30'
                                : 'border-border'
                            }`}
                              style={{ backgroundColor: scheme.previewColor + '15' }}
                            >
                              <div className="flex">
                                <div
                                  className="w-5 h-5 rounded-full ring-1 ring-white/30"
                                  style={{ backgroundColor: scheme.previewColor }}
                                />
                                <div
                                  className="-ml-1.5 w-5 h-5 rounded-full opacity-50"
                                  style={{ backgroundColor: scheme.previewColor }}
                                />
                                <div
                                  className="-ml-1.5 w-5 h-5 rounded-full opacity-25"
                                  style={{ backgroundColor: scheme.previewColor }}
                                />
                              </div>
                            </div>
                            <div className="min-w-0 text-left">
                              <span className={`text-[13px] font-semibold truncate block ${
                                colorScheme === scheme.id ? 'text-accent' : 'text-text'
                              }`}>
                                {locale.startsWith('zh') ? scheme.nameZh : scheme.name}
                              </span>
                              <span className="text-[10px] text-text-tertiary truncate mt-0.5 block">
                                {scheme.name}
                              </span>
                            </div>
                            {colorScheme === scheme.id && (
                              <CheckCircle size={14} className="absolute top-2 right-2 text-accent animate-fade-in" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="mt-8 pt-7 border-t border-border">
                      <div className="flex flex-col mb-4">
                        <span className="section-eyebrow">{t('settingsLocale.language')}</span>
                      </div>
                      <div className="flex gap-3">
                        {['en', 'zh'].map((l) => (
                          <button
                            key={l}
                            onClick={() => {
                              setLocale(l)
                              i18n.changeLanguage(l)
                            }}
                            className={`flex-1 py-3 px-4 rounded-lg border text-center transition-colors duration-150 ${
                              locale === l
                                ? 'border-accent bg-accent-subtle'
                                : 'border-border hover:border-accent/30 bg-surface'
                            }`}
                          >
                            <span className={`text-[13px] font-semibold block ${locale === l ? 'text-accent' : 'text-text'}`}>
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
              <ScrollShadow className="h-full px-8 py-7">
                <MCPSettings />
              </ScrollShadow>
            )}
            {activeTab === 'skills' && (
              <ScrollShadow className="h-full px-8 py-7">
                <SkillSettings />
              </ScrollShadow>
            )}
            {activeTab === 'websearch' && (
              <ScrollShadow className="h-full px-8 py-7">
                <WebSearchSettings />
              </ScrollShadow>
            )}
            {activeTab === 'voice' && (
              <ScrollShadow className="h-full">
                <VoiceInputSettings />
              </ScrollShadow>
            )}
          </div>

          {/* Footer */}
          {missingModelWarning && (
            <div className="shrink-0 flex items-center gap-3 px-8 py-2.5 bg-amber-500/5 border-t border-amber-500/15 animate-fade-in">
              <AlertTriangle size={16} className="text-amber-500 shrink-0" />
              <span className="text-[13px] font-bold text-amber-500 tracking-tight">
                Some providers have API key but no model selected — please choose a model to enable chatting
              </span>
            </div>
          )}
          <footer className="shrink-0 flex items-center justify-end gap-3 px-8 h-[68px] border-t border-border bg-surface-secondary/55">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg text-[13px] font-semibold text-text-secondary hover:bg-surface-secondary hover:text-text transition-colors duration-150 border border-transparent hover:border-border"
            >
              {t('settings.buttons.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold transition-colors duration-150 ${
                saved
                  ? 'text-green-600 bg-green-500/10 border border-green-500/20'
                  : 'bg-accent text-accent-foreground hover:bg-accent-light border border-transparent'
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
            </button>
          </footer>
        </div>

      </div>
    </div>,
    document.body
  )
}
