import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronUp, Gauge } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../stores'
import type { ReasoningLevel } from '../../types'
import { fetchModelCapabilities } from '../../utils/piClient'
import {
  getReasoningPreference,
  setReasoningPreference,
  type ModelReasoningCapabilities,
} from '../../utils/reasoning'

interface ReasoningLevelSelectorProps {
  providerId: string
  modelId: string
  providerApi?: string
  baseUrl?: string
}

const LEVEL_ORDER: ReasoningLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

export function ReasoningLevelSelector({
  providerId,
  modelId,
  providerApi,
  baseUrl,
}: ReasoningLevelSelectorProps) {
  const { t } = useTranslation()
  const config = useAppStore((state) => state.providerConfigs[providerId])
  const setProviderConfig = useAppStore((state) => state.setProviderConfig)
  const [capabilities, setCapabilities] = useState<ModelReasoningCapabilities | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [dropdownPos, setDropdownPos] = useState<{ left: number; bottom: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let active = true
    setCapabilities(null)
    fetchModelCapabilities(providerId, modelId, {
      api: providerApi,
      baseUrl,
      reasoningSupport: config?.reasoningSupport,
      thinkingFormat: config?.thinkingFormat,
    }).then((next) => {
      if (active) setCapabilities(next)
    })
    return () => { active = false }
  }, [providerId, modelId, providerApi, baseUrl, config?.reasoningSupport, config?.thinkingFormat])

  const selected = capabilities
    ? getReasoningPreference(config, modelId, capabilities)
    : 'off'
  const supported = capabilities?.supportedThinkingLevels || ['off']
  const canChange = capabilities?.reasoning === true && supported.length > 1

  const close = useCallback(() => {
    setIsOpen(false)
    setDropdownPos(null)
  }, [])

  const toggle = useCallback(() => {
    if (!canChange) return
    if (isOpen) {
      close()
      return
    }
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) setDropdownPos({ left: rect.left + rect.width / 2, bottom: window.innerHeight - rect.top + 10 })
    setIsOpen(true)
  }, [canChange, close, isOpen])

  const choose = useCallback((level: ReasoningLevel) => {
    if (!config) return
    setProviderConfig(providerId, setReasoningPreference(config, modelId, level))
    close()
  }, [close, config, modelId, providerId, setProviderConfig])

  const dropdown = isOpen && dropdownPos && (
    <>
      <div className="fixed inset-0 z-40" onClick={close} />
      <div
        className="fixed z-50 w-56 rounded-2xl border border-border-light bg-white dark:bg-gray-900 p-2 shadow-[0_16px_64px_rgba(0,0,0,0.18)] animate-scale-in origin-bottom"
        style={{ left: dropdownPos.left - 112, bottom: dropdownPos.bottom }}
      >
        <div className="px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-text-tertiary">
          {t('chat.reasoning.title')}
        </div>
        {LEVEL_ORDER.filter((level) => supported.includes(level)).map((level) => (
          <button
            key={level}
            type="button"
            aria-label={`Reasoning level: ${level}`}
            onClick={() => choose(level)}
            className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors ${
              selected === level ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:bg-surface-secondary hover:text-text'
            }`}
          >
            <span>
              <span className="block text-[12px] font-bold">{t(`chat.reasoning.levels.${level}`)}</span>
              <span className="mt-0.5 block text-[10px] text-text-tertiary">{t(`chat.reasoning.hints.${level}`)}</span>
            </span>
            {selected === level && <Check size={14} />}
          </button>
        ))}
      </div>
    </>
  )

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={buttonRef}
        type="button"
        disabled={!canChange}
        onClick={toggle}
        aria-label={`Reasoning: ${selected}`}
        title={capabilities?.reasoning ? t('chat.reasoning.change') : t('chat.reasoning.unsupported')}
        className="flex items-center gap-1 rounded-full border border-transparent px-2 py-0.5 font-bold uppercase tracking-[0.15em] text-accent transition-colors hover:border-accent/20 hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Gauge size={12} strokeWidth={2.4} />
        {capabilities ? t(`chat.reasoning.levels.${selected}`) : '...'}
        {canChange && <ChevronUp size={10} strokeWidth={3} className={`transition-transform ${isOpen ? '' : 'rotate-180'}`} />}
      </button>
      {createPortal(dropdown, document.body)}
    </span>
  )
}
