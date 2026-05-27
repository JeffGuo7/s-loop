import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAgentStore } from '../../../stores'
import type { SlashCommand } from '../../../types/agent'

interface SlashCommandMenuProps {
  text: string
  onSelect: (command: SlashCommand) => void
  onClose: () => void
}

export function SlashCommandMenu({ text, onSelect, onClose }: SlashCommandMenuProps) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const activeAgentId = useAgentStore((s) => s.activeAgentId)
  const agents = useAgentStore((s) => s.agents)
  const activeAgent = agents.find((a) => a.id === activeAgentId)
  const commands = activeAgent?.slashCommands || []

  // Extract filter text after "/"
  useEffect(() => {
    const slashIdx = text.lastIndexOf('/')
    if (slashIdx !== -1) {
      setFilter(text.slice(slashIdx + 1))
    }
  }, [text])

  const filtered = commands.filter((c) =>
    c.name.toLowerCase().includes(filter.toLowerCase())
  )

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault()
      onSelect(filtered[selectedIndex])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }, [filtered, selectedIndex, onSelect, onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Reset selection when filter changes
  useEffect(() => setSelectedIndex(0), [filter])

  if (filtered.length === 0) return null

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 mb-2 w-72 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xl overflow-hidden z-50 animate-fade-in"
    >
      <div className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] border-b border-[var(--color-border)]/50">
        {t('chat.slashCommands') || 'Slash Commands'}
      </div>
      <div className="max-h-48 overflow-y-auto">
        {filtered.map((cmd, idx) => (
          <button
            key={cmd.name}
            onClick={() => onSelect(cmd)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
              idx === selectedIndex
                ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]'
            }`}
          >
            <span className="text-[11px] font-bold font-mono text-[var(--color-accent)] opacity-70">
              /{cmd.name}
            </span>
            <span className="text-[10px] text-[var(--color-text-tertiary)] truncate flex-1">
              {cmd.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
