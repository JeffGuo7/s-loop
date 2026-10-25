import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export function ConfirmRemoveModal({
  title,
  message,
  onConfirm,
  onCancel,
}: {
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="mx-4 w-full max-w-xs rounded-2xl border border-border-light/70 bg-white/95 p-6 shadow-2xl backdrop-blur-xl dark:bg-gray-900/95"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[13px] font-bold tracking-tight text-text">
          {title}
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-text-tertiary">
          {message}
        </p>
        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={onConfirm}
            className="flex-1 rounded-full bg-red-500 px-4 py-2 text-[11px] font-black text-white transition-all duration-300 hover:bg-red-600"
          >
            {t('common.confirm')}
          </button>
          <button
            onClick={onCancel}
            className="flex-1 rounded-full bg-white/75 px-4 py-2 text-[11px] font-black text-text-tertiary transition-all duration-300 hover:text-text dark:bg-white/10"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function PickerModal({
  title,
  emptyText,
  localItems,
  discoverItems,
  discoverLoading,
  discoverError,
  discoverEmptyText,
  initialActiveTab = 'local',
  discoverSources,
  activeDiscoverSource,
  onDiscoverSourceChange,
  onDiscoverSearch,
  onClose,
}: {
  title: string
  emptyText: string
  localItems: Array<{
    key: string
    title: string
    subtitle?: string
    actionLabel: string
    onClick: () => void
    badges?: string[]
    busy?: boolean
  }>
  discoverItems?: Array<{
    key: string
    title: string
    subtitle?: string
    actionLabel: string
    onClick: () => void
    badges?: string[]
    busy?: boolean
  }>
  discoverLoading?: boolean
  discoverError?: string | null
  discoverEmptyText?: string
  initialActiveTab?: 'local' | 'discover'
  discoverSources?: Array<{ key: string; label: string }>
  activeDiscoverSource?: string
  onDiscoverSourceChange?: (value: string) => void
  onDiscoverSearch?: (query: string) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<'local' | 'discover'>(initialActiveTab)
  const [query, setQuery] = useState('')
  const list = activeTab === 'local'
    ? localItems.filter((item) => {
        const keyword = query.trim().toLowerCase()
        if (!keyword) return true
        return `${item.title} ${item.subtitle || ''}`.toLowerCase().includes(keyword)
      })
    : (discoverItems || [])
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 px-4 backdrop-blur-[2px]">
      <div className="w-full max-w-[340px] rounded-[28px] border border-border-light/70 bg-white/92 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.12)] backdrop-blur-2xl dark:bg-[#171717]/95">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-[14px] font-black tracking-tight text-text">
            {title}
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-surface-secondary/70 px-3 py-1 text-[10px] font-black text-text-tertiary transition-all duration-300 hover:text-text"
          >
            {t('common.close')}
          </button>
        </div>

        <div className="mb-3 flex gap-1 rounded-2xl bg-surface-secondary/55 p-1">
          <button
            onClick={() => setActiveTab('local')}
            className={`flex-1 rounded-xl px-3 py-2 text-[11px] font-black transition-all duration-300 ${
              activeTab === 'local' ? 'bg-accent text-white' : 'text-text-secondary'
            }`}
          >
            {t('agentStudio.library.local')}
          </button>
          <button
            onClick={() => {
              setActiveTab('discover')
            }}
            className={`flex-1 rounded-xl px-3 py-2 text-[11px] font-black transition-all duration-300 ${
              activeTab === 'discover' ? 'bg-accent text-white' : 'text-text-secondary'
            }`}
          >
            {t('agentStudio.library.discover')}
          </button>
        </div>

        <div className="mb-3 flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
            }}
            placeholder={t('agentStudio.library.searchPlaceholder')}
            className="w-full rounded-2xl border border-border-light bg-surface-secondary/45 px-3 py-2.5 text-[11px] text-text-secondary outline-none transition-all focus:border-accent/30"
          />
          {activeTab === 'discover' && (
            <button
              onClick={() => onDiscoverSearch?.(query)}
              className="shrink-0 rounded-2xl bg-accent px-4 py-2.5 text-[11px] font-black text-white transition-all duration-300 hover:opacity-90"
            >
              {t('common.search')}
            </button>
          )}
        </div>

        {activeTab === 'discover' && (
          <div className="mb-3 rounded-2xl border border-accent/15 bg-accent/8 px-3 py-2.5">
            <div className="text-[11px] font-black tracking-tight text-accent">
              {t('agentStudio.library.remoteTitle')}
            </div>
            <div className="mt-1 text-[10px] leading-relaxed text-text-tertiary">
              {t('agentStudio.library.remoteHint')}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-white/80 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-text-secondary dark:bg-white/10">
                {t('agentStudio.library.flowSearch')}
              </span>
              <span className="rounded-full bg-white/80 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-text-secondary dark:bg-white/10">
                {t('agentStudio.library.flowInstall')}
              </span>
              <span className="rounded-full bg-white/80 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-text-secondary dark:bg-white/10">
                {t('agentStudio.library.flowMount')}
              </span>
            </div>
            {discoverSources && discoverSources.length > 0 && (
              <div className="mt-3 flex gap-1 rounded-2xl bg-white/60 p-1 dark:bg-white/5">
                {discoverSources.map((source) => (
                  <button
                    key={source.key}
                    onClick={() => onDiscoverSourceChange?.(source.key)}
                    className={`flex-1 rounded-xl px-3 py-2 text-[10px] font-black transition-all duration-300 ${
                      activeDiscoverSource === source.key ? 'bg-accent text-white' : 'text-text-secondary'
                    }`}
                  >
                    {source.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'discover' && discoverLoading ? (
          <div className="rounded-2xl bg-surface-secondary/45 px-4 py-6 text-center text-[11px] text-text-tertiary">
            {t('agentStudio.library.remoteLoading')}
          </div>
        ) : activeTab === 'discover' && discoverError ? (
          <div className="rounded-2xl bg-red-50/80 px-4 py-6 text-center text-[11px] text-red-500 dark:bg-red-500/10">
            {discoverError}
          </div>
        ) : list.length === 0 ? (
          <div className="rounded-2xl bg-surface-secondary/45 px-4 py-6 text-center text-[11px] text-text-tertiary">
            {activeTab === 'discover' ? (discoverEmptyText || emptyText) : emptyText}
          </div>
        ) : (
          <div className="max-h-[360px] space-y-2 overflow-y-auto scrollbar-subtle pr-1">
            {list.map((item) => (
              <div
                key={item.key}
                className="rounded-2xl border border-border-light/70 bg-surface-secondary/45 px-3 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[12px] font-bold tracking-tight text-text">
                    {item.title}
                  </div>
                  {activeTab === 'discover' && (
                    <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-accent">
                      {t('agentStudio.library.remoteBadge')}
                    </span>
                  )}
                </div>
                {item.subtitle && (
                  <div className="mt-1 text-[10px] leading-relaxed text-text-tertiary">
                    {item.subtitle}
                  </div>
                )}
                {item.badges && item.badges.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {item.badges.map((badge) => (
                      <span
                        key={`${item.key}-${badge}`}
                        className="rounded-full bg-white/80 px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-text-secondary dark:bg-white/10"
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                )}
                <button
                  onClick={item.onClick}
                  disabled={item.busy}
                  className="mt-3 rounded-xl bg-accent px-3 py-2 text-[11px] font-black text-white transition-all duration-300 hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
                >
                  {item.busy ? t('agentStudio.library.installing') : item.actionLabel}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function CreateAgentModal({
  title,
  nameValue,
  descriptionValue,
  instructionsValue,
  modelValue,
  permissionModeValue,
  showAdvanced,
  onNameChange,
  onDescriptionChange,
  onInstructionsChange,
  onModelChange,
  onPermissionModeChange,
  onToggleAdvanced,
  onClose,
  onSubmit,
}: {
  title: string
  nameValue: string
  descriptionValue: string
  instructionsValue: string
  modelValue: string
  permissionModeValue: 'ask' | 'allow' | 'deny'
  showAdvanced: boolean
  onNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onInstructionsChange: (value: string) => void
  onModelChange: (value: string) => void
  onPermissionModeChange: (value: 'ask' | 'allow' | 'deny') => void
  onToggleAdvanced: () => void
  onClose: () => void
  onSubmit: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 px-4 backdrop-blur-[2px]">
      <div className="w-full max-w-[360px] rounded-[28px] border border-border-light/70 bg-white/92 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.12)] backdrop-blur-2xl dark:bg-[#171717]/95">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="text-[14px] font-black tracking-tight text-text">
            {title}
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-surface-secondary/70 px-3 py-1 text-[10px] font-black text-text-tertiary transition-all duration-300 hover:text-text"
          >
            {t('common.close')}
          </button>
        </div>

        <div className="space-y-3">
          <input
            type="text"
            value={nameValue}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={t('agentStudio.currentAgent.namePlaceholder')}
            className="w-full rounded-2xl border border-border-light bg-surface-secondary/55 px-3 py-3 text-[12px] font-semibold text-text outline-none transition-all focus:border-accent/30"
          />
          <textarea
            value={descriptionValue}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder={t('agentStudio.currentAgent.descriptionPlaceholder')}
            rows={3}
            className="w-full resize-none rounded-2xl border border-border-light bg-surface-secondary/55 px-3 py-3 text-[12px] text-text-secondary outline-none transition-all focus:border-accent/30"
          />
          <div className="rounded-[24px] border border-border-light/70 bg-surface-secondary/30 p-3">
            <button
              onClick={onToggleAdvanced}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-accent/70">
                  {t('agentStudio.advanced.title')}
                </div>
                <p className="mt-1 text-[10px] text-text-tertiary">
                  {t('agentStudio.advanced.optionalCreate')}
                </p>
              </div>
              <span className="rounded-full bg-white/75 px-3 py-1 text-[10px] font-black tracking-[0.08em] text-text-tertiary dark:bg-white/10">
                {showAdvanced ? t('agentStudio.advanced.hide') : t('agentStudio.advanced.show')}
              </span>
            </button>

            {showAdvanced && (
              <div className="mt-3 space-y-3">
                <textarea
                  value={instructionsValue}
                  onChange={(e) => onInstructionsChange(e.target.value)}
                  placeholder={t('agentStudio.advanced.instructionsPlaceholder')}
                  rows={4}
                  className="w-full resize-none rounded-2xl border border-border-light bg-white/75 px-3 py-3 text-[12px] text-text-secondary outline-none transition-all focus:border-accent/30 dark:bg-white/10"
                />
                <input
                  type="text"
                  value={modelValue}
                  onChange={(e) => onModelChange(e.target.value)}
                  placeholder={t('agentStudio.advanced.modelPlaceholder')}
                  className="w-full rounded-2xl border border-border-light bg-white/75 px-3 py-3 text-[12px] text-text-secondary outline-none transition-all focus:border-accent/30 dark:bg-white/10"
                />
                <select
                  value={permissionModeValue}
                  onChange={(e) => onPermissionModeChange(e.target.value as 'ask' | 'allow' | 'deny')}
                  className="w-full rounded-2xl border border-border-light bg-white/75 px-3 py-3 text-[12px] font-semibold text-text outline-none transition-all focus:border-accent/30 dark:bg-white/10"
                >
                  <option value="ask">{t('common.ask')}</option>
                  <option value="allow">{t('common.allow')}</option>
                  <option value="deny">{t('common.deny')}</option>
                </select>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-border-light bg-surface-secondary/60 px-3 py-2.5 text-[11px] font-black text-text-secondary transition-all duration-300 hover:text-text"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onSubmit}
            className="rounded-xl bg-accent px-3 py-2.5 text-[11px] font-black text-white shadow-lg shadow-accent/10 transition-all duration-300 hover:-translate-y-0.5"
          >
            {t('agentStudio.currentAgent.create')}
          </button>
        </div>
      </div>
    </div>
  )
}

