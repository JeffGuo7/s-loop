import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, ChevronDown } from 'lucide-react'
import { useAgentStore } from '../../stores'
import { AgentAssemblyPanel } from './AgentAssemblyPanel'

export function AgentBuilder() {
  const agents = useAgentStore((s) => s.agents)
  const activeAgentId = useAgentStore((s) => s.activeAgentId)
  const [expanded, setExpanded] = useState(true)

  const activeAgent = agents.find((a) => a.id === activeAgentId)

  return (
    <div className="border-t border-border-light/30 mt-2">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-2.5 group"
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-accent/10 flex items-center justify-center">
            <Brain size={12} className="text-accent" strokeWidth={2.5} />
          </div>
          <span className="text-[11px] font-black tracking-tight text-text-secondary">
            Agent Builder
          </span>
          {activeAgent && (
            <span className="text-[10px] font-bold text-accent/60 ml-1">
              · {activeAgent.avatar} {activeAgent.name}
            </span>
          )}
        </div>
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.3 }}
        >
          <ChevronDown size={12} className="text-text-quaternary/50" />
        </motion.div>
      </button>

      {/* Body */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="agent-builder-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-3">
              <AgentAssemblyPanel />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
