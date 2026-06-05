import { useTranslation } from 'react-i18next'
import { Globe, Check, ChevronDown } from 'lucide-react'
import { useWebSearchStore } from '../../stores'
import type { WebSearchProviderConfig } from '../../types/websearch'

export function WebSearchSettings() {
  const { t } = useTranslation()
  const {
    activeProvider,
    providers,
    maxResults,
    setActiveProvider,
    updateProvider,
    setMaxResults,
    toggleProvider,
  } = useWebSearchStore()

  const activeConfig = providers.find(p => p.id === activeProvider)

  return (
    <div className="space-y-8 animate-slide-up">
      <div>
        <h3 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">{t('settings.websearch.title')}</h3>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          {t('settings.websearch.description')}
        </p>
      </div>

      {/* Provider selection */}
      <div className="space-y-4">
        <label className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] ml-1">
          {t('settings.websearch.searchEngine')}
        </label>
        <div className="grid gap-3">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              isActive={activeProvider === provider.id}
              onSelect={() => {
                setActiveProvider(provider.id)
                if (!provider.enabled) {
                  toggleProvider(provider.id)
                }
              }}
              onUpdate={(updates) => updateProvider(provider.id, updates)}
            />
          ))}
        </div>
      </div>

      {/* Max results */}
      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] ml-1">
          {t('settings.websearch.maxResults')}
        </label>
        <div className="relative inline-block">
          <select
            value={maxResults}
            onChange={(e) => setMaxResults(Number(e.target.value))}
            className="px-4 py-2.5 bg-[var(--color-surface-secondary)] border border-[var(--color-border)] rounded-xl focus:ring-2 focus:ring-[var(--color-accent)] outline-none text-sm font-bold appearance-none cursor-pointer pr-10"
          >
            {[3, 5, 10, 15, 20].map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--color-text-tertiary)]" />
        </div>
      </div>

      {/* Current status */}
      {activeConfig && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--color-accent-muted)] border border-[var(--color-accent)]/20">
          <Check size={16} className="text-[var(--color-accent)] shrink-0" />
          <div className="text-sm">
            <span className="font-bold text-[var(--color-text)]">{t('settings.websearch.usingProvider')}: {activeConfig.name}</span>
            <span className="text-[var(--color-text-secondary)] ml-2">
              {activeConfig.enabled
                ? t('settings.websearch.active')
                : t('settings.websearch.needsConfig')}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

interface ProviderCardProps {
  provider: WebSearchProviderConfig
  isActive: boolean
  onSelect: () => void
  onUpdate: (updates: Partial<WebSearchProviderConfig>) => void
}

function ProviderCard({ provider, isActive, onSelect, onUpdate }: ProviderCardProps) {

  return (
    <div
      className={`relative rounded-xl border-2 transition-all cursor-pointer ${
        isActive
          ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)] shadow-md'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-accent-light)]'
      }`}
      onClick={onSelect}
    >
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${
              isActive ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-surface-secondary)] text-[var(--color-text-tertiary)]'
            }`}>
              <Globe size={18} />
            </div>
            <div>
              <h4 className="font-bold text-[var(--color-text)]">{provider.name}</h4>
              <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 max-w-md">
                {provider.description}
              </p>
            </div>
          </div>
          {isActive && (
            <div className="w-6 h-6 rounded-full bg-[var(--color-accent)] flex items-center justify-center">
              <Check size={14} className="text-white" />
            </div>
          )}
        </div>

        {/* Config fields (expand when active) */}
        {isActive && provider.needsConfig && (
          <div className="mt-4 space-y-3 pl-11" onClick={e => e.stopPropagation()}>
            {provider.requiredFields.includes('apiKey') && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                  API Key
                </label>
                <input
                  type="password"
                  value={provider.apiKey || ''}
                  onChange={(e) => onUpdate({ apiKey: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-accent)] outline-none text-sm font-mono"
                  placeholder="sk-..."
                />
              </div>
            )}
            {provider.requiredFields.includes('apiUrl') && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                  Server URL
                </label>
                <input
                  type="url"
                  value={provider.apiUrl || ''}
                  onChange={(e) => onUpdate({ apiUrl: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg focus:ring-2 focus:ring-[var(--color-accent)] outline-none text-sm font-mono"
                  placeholder="http://localhost:8080"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
