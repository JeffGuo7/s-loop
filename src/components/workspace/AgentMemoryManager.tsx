import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Brain, Check, Clock3, FolderKanban, Trash2, X } from 'lucide-react'
import { useAgentStore } from '../../stores/agentStore'
import type { Agent, AgentMemoryScope } from '../../types/agent'

interface AgentMemoryManagerProps {
  agent: Agent
  workspaceDir?: string
}

export function AgentMemoryManager({ agent, workspaceDir }: AgentMemoryManagerProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState('')
  const [scope, setScope] = useState<AgentMemoryScope>('agent')
  const addMemoryCandidate = useAgentStore((state) => state.addMemoryCandidate)
  const reviewMemory = useAgentStore((state) => state.reviewMemory)
  const removeMemory = useAgentStore((state) => state.removeMemory)
  const memories = [...agent.memories].sort((left, right) => right.createdAt - left.createdAt)
  const candidateCount = memories.filter((memory) => memory.status === 'candidate').length
  const approvedCount = memories.filter((memory) => memory.status === 'approved').length

  const addCandidate = () => {
    const created = addMemoryCandidate(
      agent.id,
      draft,
      scope,
      scope === 'workspace' ? workspaceDir : undefined,
    )
    if (created) setDraft('')
  }

  return (
    <div className="rounded-2xl border border-border-light bg-surface-secondary/35 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-text-secondary">
            <Brain size={13} className="text-accent" />
            {t('agentStudio.memory.managerTitle')}
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-text-quaternary">
            {t('agentStudio.memory.managerHint')}
          </p>
        </div>
        <div className="flex gap-1.5 text-[9px] font-bold text-text-tertiary">
          <span className="rounded-full bg-amber-500/10 px-2 py-1 text-amber-600">{candidateCount} {t('agentStudio.memory.candidate')}</span>
          <span className="rounded-full bg-green-500/10 px-2 py-1 text-green-600">{approvedCount} {t('agentStudio.memory.approved')}</span>
        </div>
      </div>

      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={t('agentStudio.memory.candidatePlaceholder')}
        rows={3}
        className="mt-3 w-full resize-none rounded-xl border border-border-light bg-surface px-3 py-2.5 text-[11px] text-text-secondary outline-none transition-colors focus:border-accent/30"
      />
      <div className="mt-2 flex items-center gap-2">
        <select
          value={scope}
          onChange={(event) => setScope(event.target.value as AgentMemoryScope)}
          className="min-w-0 flex-1 rounded-xl border border-border-light bg-surface px-3 py-2 text-[10px] font-semibold text-text outline-none"
        >
          <option value="agent">{t('agentStudio.memory.scopeAgent')}</option>
          <option value="workspace" disabled={!workspaceDir}>{t('agentStudio.memory.scopeCurrentWorkspace')}</option>
        </select>
        <button
          type="button"
          onClick={addCandidate}
          disabled={!draft.trim() || (scope === 'workspace' && !workspaceDir)}
          className="rounded-xl bg-accent px-3 py-2 text-[10px] font-black text-white transition-opacity disabled:opacity-40"
        >
          {t('agentStudio.memory.addCandidate')}
        </button>
      </div>
      {scope === 'workspace' && workspaceDir && (
        <p className="mt-1.5 truncate text-[9px] text-text-quaternary">{workspaceDir}</p>
      )}

      <div className="mt-3 space-y-2">
        {memories.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-light px-3 py-4 text-center text-[10px] text-text-quaternary">
            {t('agentStudio.memory.empty')}
          </p>
        ) : memories.map((memory) => (
          <div key={memory.id} className="rounded-xl border border-border-light bg-surface px-3 py-2.5">
            <div className="flex items-start gap-2">
              <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${
                memory.status === 'approved'
                  ? 'bg-green-500/10 text-green-600'
                  : memory.status === 'rejected'
                    ? 'bg-red-500/10 text-red-500'
                    : 'bg-amber-500/10 text-amber-600'
              }`}>
                {memory.status === 'approved' ? <Check size={11} /> : memory.status === 'rejected' ? <X size={11} /> : <Clock3 size={11} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-text-secondary">{memory.content}</p>
                <div className="mt-1.5 flex items-center gap-2 text-[9px] text-text-quaternary">
                  <span className="inline-flex items-center gap-1">
                    {memory.scope === 'workspace' && <FolderKanban size={9} />}
                    {memory.scope === 'workspace' ? t('agentStudio.memory.workspaceScoped') : t('agentStudio.memory.agentScoped')}
                  </span>
                  <span>{t(`agentStudio.memory.${memory.status}`)}</span>
                </div>
                {memory.scope === 'workspace' && memory.workspacePath && (
                  <p className="mt-1 truncate text-[9px] text-text-quaternary">{memory.workspacePath}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                {memory.status !== 'approved' && (
                  <button type="button" onClick={() => reviewMemory(agent.id, memory.id, 'approved')} className="rounded-md p-1 text-text-quaternary hover:bg-green-500/10 hover:text-green-600" title={t('agentStudio.memory.approve')}>
                    <Check size={12} />
                  </button>
                )}
                {memory.status !== 'rejected' && (
                  <button type="button" onClick={() => reviewMemory(agent.id, memory.id, 'rejected')} className="rounded-md p-1 text-text-quaternary hover:bg-red-500/10 hover:text-red-500" title={t('agentStudio.memory.reject')}>
                    <X size={12} />
                  </button>
                )}
                <button type="button" onClick={() => removeMemory(agent.id, memory.id)} className="rounded-md p-1 text-text-quaternary hover:bg-red-500/10 hover:text-red-500" title={t('common.delete')}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
