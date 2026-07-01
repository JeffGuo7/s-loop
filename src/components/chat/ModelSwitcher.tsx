import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Cpu, ChevronUp, Search, Check } from 'lucide-react'
import { useAppStore } from '../../stores'
import * as Pi from '../../utils/piClient'

interface ModelSwitcherProps {
  providerId: string
  currentModel: string
  providerApi?: string
  apiKey?: string
  baseUrl?: string
}

export function ModelSwitcher({ providerId, currentModel, providerApi, apiKey, baseUrl }: ModelSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [models, setModels] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ left: number; bottom: number } | null>(null)

  const fetchAndShow = useCallback(async () => {
    if (isOpen) { setIsOpen(false); setDropdownPos(null); return }
    setSearchQuery('')
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect) {
      setDropdownPos({ left: rect.left + rect.width / 2, bottom: window.innerHeight - rect.top + 12 })
    }
    if (models.length === 0) {
      setLoading(true)
      const list = await Pi.fetchModels(providerId, apiKey, baseUrl, providerApi)
      setModels(list)
      setLoading(false)
    }
    setIsOpen(true)
  }, [isOpen, providerId, apiKey, baseUrl, providerApi, models.length])

  const close = useCallback(() => {
    setIsOpen(false)
    setDropdownPos(null)
  }, [])

  const handleSelect = useCallback((modelId: string) => {
    useAppStore.getState().setProviderConfig(providerId, { model: modelId })
    close()
  }, [providerId, close])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, close])

  const filtered = searchQuery
    ? models.filter(m => m.id.toLowerCase().includes(searchQuery.toLowerCase()) || m.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : models

  const dropdown = isOpen && dropdownPos && (
    <>
      <div className="fixed inset-0 z-40" onClick={close} />
      <div
        className="fixed z-50 w-72 max-h-[380px] bg-white dark:bg-gray-900 rounded-2xl border border-border-light shadow-[0_16px_64px_rgba(0,0,0,0.18)] overflow-hidden animate-scale-in origin-bottom"
        style={{ left: dropdownPos.left - 144, bottom: dropdownPos.bottom }}
      >
        <div className="p-3 border-b border-border-light">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-secondary/50 border border-border-light">
            <Search size={12} className="text-text-quaternary shrink-0" />
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter models..."
              className="bg-transparent text-[12px] font-medium text-text outline-none w-full placeholder:text-text-quaternary/40"
            />
          </div>
        </div>
        <div className="max-h-[300px] overflow-y-auto p-2 custom-scrollbar">
          {loading ? (
            <div className="py-10 text-center">
              <Cpu size={18} className="text-accent/40 mx-auto animate-pulse" />
              <p className="mt-3 text-[11px] font-medium text-text-tertiary">Loading models...</p>
            </div>
          ) : filtered.length > 0 ? (
            <div className="space-y-0.5">
              {filtered.map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleSelect(m.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all duration-200 group ${
                    currentModel === m.id
                      ? 'bg-accent/10 text-accent'
                      : 'hover:bg-surface-secondary text-text-secondary hover:text-text'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-bold tracking-tight truncate">{m.id}</div>
                    {m.name !== m.id && (
                      <div className="text-[10px] text-text-tertiary truncate mt-0.5">{m.name}</div>
                    )}
                  </div>
                  {currentModel === m.id && <Check size={14} className="text-accent shrink-0 ml-2" />}
                </button>
              ))}
            </div>
          ) : (
            <div className="py-10 text-center">
              <p className="text-[12px] font-medium text-text-tertiary italic opacity-50">No models found</p>
            </div>
          )}
        </div>
      </div>
    </>
  )

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={buttonRef}
        onClick={fetchAndShow}
        className="font-bold uppercase tracking-[0.2em] text-accent flex items-center gap-1 px-2.5 py-0.5 -mx-1 rounded-full hover:bg-accent/10 transition-all duration-300 cursor-pointer border border-transparent hover:border-accent/20"
        title="Switch model"
      >
        {loading ? '...' : currentModel}
        <ChevronUp size={11} strokeWidth={3} className={`transition-transform duration-300 ${isOpen ? 'rotate-0' : 'rotate-180'} text-accent/70`} />
      </button>
      {createPortal(dropdown, document.body)}
    </span>
  )
}
