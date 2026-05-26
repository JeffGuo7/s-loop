import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, Trash2, Copy } from 'lucide-react'
import { useAgentStore } from '../../stores'

export function AgentSwitcher() {
  const { t } = useTranslation()
  const agents = useAgentStore((s) => s.agents)
  const activeAgentId = useAgentStore((s) => s.activeAgentId)
  const setActiveAgent = useAgentStore((s) => s.setActiveAgent)
  const createAgent = useAgentStore((s) => s.createAgent)
  const deleteAgent = useAgentStore((s) => s.deleteAgent)
  const duplicateAgent = useAgentStore((s) => s.duplicateAgent)

  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')

  const handleCreate = () => {
    if (!name.trim()) return
    createAgent(name.trim(), desc.trim())
    setName('')
    setDesc('')
    setShowCreate(false)
  }

  return (
    <div className="space-y-2">
      {/* Agent Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
        {agents.map((agent) => (
          <motion.button
            key={agent.id}
            layout
            onClick={() => setActiveAgent(agent.id)}
            className={`group relative flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all duration-300 ${
              agent.id === activeAgentId
                ? 'bg-accent/10 text-accent shadow-sm'
                : 'bg-surface-secondary/40 text-text-tertiary hover:text-text-secondary hover:bg-surface-secondary/60'
            }`}
          >
            <span className="text-[11px]">{agent.avatar}</span>
            <span className="truncate max-w-[60px]">{agent.name}</span>
            {agents.length > 1 && (
              <div className="flex gap-0.5 ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <span
                  onClick={(e) => {
                    e.stopPropagation()
                    duplicateAgent(agent.id)
                  }}
                  className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-text-quaternary hover:text-text-secondary transition-colors"
                >
                  <Copy size={9} />
                </span>
                <span
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteAgent(agent.id)
                  }}
                  className="p-0.5 rounded hover:bg-red-500/10 text-text-quaternary hover:text-red-400 transition-colors"
                >
                  <Trash2 size={9} />
                </span>
              </div>
            )}
          </motion.button>
        ))}

        {/* Add Button */}
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg bg-surface-secondary/40 border border-border-light/30 text-text-tertiary hover:text-accent hover:border-accent/30 transition-all"
        >
          <Plus size={11} strokeWidth={2.5} />
        </button>
      </div>

      {/* Create Form */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-2 space-y-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('createTask.taskName')}
                className="w-full px-2.5 py-1.5 rounded-lg bg-surface-secondary/40 border border-border-light/30 text-[11px] font-medium text-text placeholder:text-text-quaternary/30 outline-none focus:border-accent/30 transition-all"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
              <input
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder={t('createTask.description')}
                className="w-full px-2.5 py-1.5 rounded-lg bg-surface-secondary/40 border border-border-light/30 text-[10px] text-text-secondary placeholder:text-text-quaternary/30 outline-none focus:border-accent/30 transition-all"
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
              <div className="flex gap-1.5">
                <button
                  onClick={handleCreate}
                  disabled={!name.trim()}
                  className="flex-1 text-[10px] font-bold py-1.5 rounded-lg bg-accent text-white disabled:opacity-40 transition-all"
                >
                  {t('createTask.scheduleAutomation')}
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-2 py-1.5 rounded-lg text-text-tertiary hover:bg-surface-secondary/60 transition-all"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
