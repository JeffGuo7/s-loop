import { useState, type ReactElement, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronRight,
  Cpu,
  Trash2,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { useAgentStore, useAppStore } from '../../stores'
import { useMCPStore } from '../../stores/mcpStore'
import { useSkillStore } from '../../stores/skillStore'

export function WorkspacePanel() {
  const { t } = useTranslation()
  const [feedback, setFeedback] = useState<string | null>(null)
  const [showSkillPicker, setShowSkillPicker] = useState(false)
  const [showMcpPicker, setShowMcpPicker] = useState(false)
  const [showCreateAgentModal, setShowCreateAgentModal] = useState(false)
  const [showCreateAdvanced, setShowCreateAdvanced] = useState(false)
  const [showDetailAdvanced, setShowDetailAdvanced] = useState(false)
  const [confirmDeleteAgentId, setConfirmDeleteAgentId] = useState<string | null>(null)
  const [busyInstallKey, setBusyInstallKey] = useState<string | null>(null)
  const [remoteSkillsLoading, setRemoteSkillsLoading] = useState(false)
  const [remoteSkillsError, setRemoteSkillsError] = useState<string | null>(null)
  const [remoteSkills, setRemoteSkills] = useState<Array<{
    id: string
    source: string
    name: string
    description: string
    owner?: string
    downloads?: number
  }>>([])
  const [newAgentName, setNewAgentName] = useState('')
  const [newAgentDescription, setNewAgentDescription] = useState('')
  const [newAgentInstructions, setNewAgentInstructions] = useState('')
  const [newAgentModel, setNewAgentModel] = useState('')
  const [newAgentPermissionMode, setNewAgentPermissionMode] = useState<'ask' | 'allow' | 'deny'>('ask')
  const [panelMode, setPanelMode] = useState<'list' | 'detail'>('list')
  const workspaceDir = useAppStore((s) => s.workspaceDir)
  const { workspaceCollapsed: collapsed, toggleWorkspace, providerConfigs, activeProvider } = useAppStore()
  const agents = useAgentStore((s) => s.agents)
  const activeAgentId = useAgentStore((s) => s.activeAgentId)
  const setActiveAgent = useAgentStore((s) => s.setActiveAgent)
  const createAgent = useAgentStore((s) => s.createAgent)
  const updateAgent = useAgentStore((s) => s.updateAgent)
  const deleteAgent = useAgentStore((s) => s.deleteAgent)
  const addSkillToAgent = useAgentStore((s) => s.addSkillToAgent)
  const removeSkillFromAgent = useAgentStore((s) => s.removeSkillFromAgent)
  const addMCPServerToAgent = useAgentStore((s) => s.addMCPServerToAgent)
  const removeMCPServerFromAgent = useAgentStore((s) => s.removeMCPServerFromAgent)
  const addAccessiblePath = useAgentStore((s) => s.addAccessiblePath)
  const removeAccessiblePath = useAgentStore((s) => s.removeAccessiblePath)
  const skills = useSkillStore((s) => s.skills)
  const skillMeta = useSkillStore((s) => s.skillMeta)
  const skillsCliSearch = useSkillStore((s) => s.skillsCliSearch)
  const skillsCliInstall = useSkillStore((s) => s.skillsCliInstall)
  const mcpServers = useMCPStore((s) => s.servers)
  const installRemoteServer = useMCPStore((s) => s.installRemoteServer)

  const activeAgent = agents.find((agent) => agent.id === activeAgentId) ?? null
  const visibleSkillNames = activeAgent?.skills ?? []
  const visibleServerNames = activeAgent?.mcpServers ?? []
  const workspaceEntries = activeAgent?.accessiblePaths ?? []
  const providerModel = activeAgent?.model || providerConfigs[activeProvider]?.model || t('chat.status.noModel')
  const moduleStats = [
    { label: t('agentStudio.stats.skills'), value: String(visibleSkillNames.length) },
    { label: 'MCP', value: String(visibleServerNames.length) },
    { label: t('agentStudio.stats.context'), value: String(workspaceEntries.length) },
  ]
  const installableSkills = skills
    .filter((skill) => !visibleSkillNames.includes(skill.name))
    .slice(0, 8)
  const installableMcpServers = mcpServers
    .filter((server) => !server.disabled && !visibleServerNames.includes(server.name))
    .slice(0, 8)
  const discoverableMcps = [
    {
      id: 'remote-mcp-1',
      name: 'filesystem-plus',
      description: t('agentStudio.library.mcpFilesystem'),
      source: 'Registry',
      type: 'MCP',
      installMode: 'stdio',
      config: {
        name: 'filesystem-plus',
        type: 'stdio' as const,
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
      },
    },
    {
      id: 'remote-mcp-2',
      name: 'browser-kit',
      description: t('agentStudio.library.mcpBrowser'),
      source: 'Registry',
      type: 'MCP',
      installMode: 'stdio',
      config: {
        name: 'browser-kit',
        type: 'stdio' as const,
        command: 'npx',
        args: ['-y', '@agentdeskai/browser-tools-mcp'],
      },
    },
    {
      id: 'remote-mcp-3',
      name: 'knowledge-base',
      description: t('agentStudio.library.mcpKnowledge'),
      source: 'Official',
      type: 'MCP',
      installMode: 'http',
      config: {
        name: 'knowledge-base',
        type: 'http' as const,
        url: 'http://localhost:8080/mcp',
      },
    },
  ]

  function resetCreateAgentDraft() {
    setNewAgentName('')
    setNewAgentDescription('')
    setNewAgentInstructions('')
    setNewAgentModel('')
    setNewAgentPermissionMode('ask')
    setShowCreateAdvanced(false)
  }

  function ensureAgentTarget() {
    if (activeAgent) return activeAgent
    const created = createAgent(
      t('agentStudio.currentAgent.newAgentName'),
      t('agentStudio.currentAgent.newAgentDescription'),
    )
    setFeedback(t('agentStudio.feedback.agentCreated', { name: created.name }))
    return created
  }

  function handleInstallSkill(skillName: string) {
    const target = ensureAgentTarget()
    addSkillToAgent(target.id, skillName)
    setActiveAgent(target.id)
    setFeedback(t('agentStudio.feedback.skillInstalled', { name: skillName }))
    setShowSkillPicker(false)
  }

  function handleInstallMcp(serverName: string) {
    const target = ensureAgentTarget()
    addMCPServerToAgent(target.id, serverName)
    setActiveAgent(target.id)
    setFeedback(t('agentStudio.feedback.mcpInstalled', { name: serverName }))
    setShowMcpPicker(false)
  }

  function handleAttachWorkspace() {
    if (!workspaceDir) return
    const target = ensureAgentTarget()
    addAccessiblePath(target.id, workspaceDir)
    setActiveAgent(target.id)
    setFeedback(t('agentStudio.feedback.workspaceAttached'))
  }

  function handleComingSoon(kind: 'knowledge' | 'memory' | 'remote') {
    if (kind === 'knowledge') {
      setFeedback(t('agentStudio.feedback.knowledgeComingSoon'))
      return
    }
    if (kind === 'memory') {
      setFeedback(t('agentStudio.feedback.memoryComingSoon'))
      return
    }
    setFeedback(t('agentStudio.feedback.remoteComingSoon'))
  }

  async function handleRemoteInstallSkill(item: {
    id: string
    source: string
    name: string
  }) {
    setBusyInstallKey(item.id)
    try {
      const result = await skillsCliInstall(item.source || item.id, item.name)

      if (result.success) {
        const target = ensureAgentTarget()
        addSkillToAgent(target.id, result.skill_name || item.name)
        setActiveAgent(target.id)
        setFeedback(t('agentStudio.feedback.remoteInstalled', { name: result.skill_name || item.name }))
        setShowSkillPicker(false)
      } else {
        setFeedback(result.message)
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t('agentStudio.feedback.remoteComingSoon'))
    } finally {
      setBusyInstallKey(null)
    }
  }

  async function fetchRemoteSkills(query: string) {
    setRemoteSkillsLoading(true)
    setRemoteSkillsError(null)

    try {
      const list = await skillsCliSearch(query)
      setRemoteSkills(list.map((item) => ({
        id: item.id,
        source: item.source || item.id,
        name: item.name,
        description: `${item.source || item.id}${item.installs > 0 ? ` · ${item.installs >= 1000 ? (item.installs / 1000).toFixed(1) + 'K' : item.installs} installs` : ''}`,
        owner: item.source?.split('/')[0],
        downloads: item.installs,
      })))
    } catch (error) {
      setRemoteSkills([])
      setRemoteSkillsError(error instanceof Error ? error.message : t('agentStudio.library.remoteSearchError'))
    } finally {
      setRemoteSkillsLoading(false)
    }
  }

  async function handleRemoteInstallMcp(item: {
    id: string
    name: string
    config: {
      name: string
      type: 'stdio' | 'http'
      command?: string
      args?: string[]
      url?: string
    }
  }) {
    setBusyInstallKey(item.id)
    try {
      await installRemoteServer(item.config, item.config.type === 'stdio')
      const target = ensureAgentTarget()
      addMCPServerToAgent(target.id, item.config.name)
      setActiveAgent(target.id)
      setFeedback(t('agentStudio.feedback.remoteInstalled', { name: item.name }))
      setShowMcpPicker(false)
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t('agentStudio.feedback.remoteComingSoon'))
    } finally {
      setBusyInstallKey(null)
    }
  }

  function handleCreateAgent() {
    const name = newAgentName.trim() || t('agentStudio.currentAgent.newAgentName')
    const description = newAgentDescription.trim()
    const created = createAgent(name, description)
    updateAgent(created.id, {
      instructions: newAgentInstructions.trim(),
      model: newAgentModel.trim(),
      permissionMode: newAgentPermissionMode,
    })
    setActiveAgent(created.id)
    setPanelMode('detail')
    setFeedback(t('agentStudio.feedback.agentCreated', { name }))
    setShowCreateAgentModal(false)
    resetCreateAgentDraft()
  }

  function handleDeleteAgent(agentId: string, agentName: string) {
    if (confirmDeleteAgentId !== agentId) {
      setConfirmDeleteAgentId(agentId)
      return
    }
    deleteAgent(agentId)
    setConfirmDeleteAgentId(null)
    setFeedback(t('agentStudio.feedback.agentDeleted', { name: agentName }))
    if (panelMode === 'detail' && activeAgentId === agentId) {
      setPanelMode('list')
    }
  }

  if (collapsed) {
    return (
      <aside 
        className="h-full flex flex-col items-center pt-10 bg-transparent sidebar-transition relative shrink-0"
        style={{ width: 'var(--spacing-workspace-panel-collapsed)' }}
      >
        <motion.button
          whileHover={{ scale: 1.1, x: -2 }}
          whileTap={{ scale: 0.9 }}
          onClick={toggleWorkspace}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-surface-secondary/80 text-accent shadow-lg shadow-accent/5 border border-white/10 backdrop-blur-md transition-all duration-500 hover:shadow-accent/20"
          title={t('agentStudio.header.panelTooltip')}
        >
          <CoreGlyph className="h-5 w-5" />
        </motion.button>
      </aside>
    )
  }

  return (
    <aside 
      className="h-full flex flex-col overflow-hidden shrink-0 sidebar-transition bg-transparent relative pt-10"
      style={{ width: 'var(--spacing-workspace-panel)' }}
    >
      <div className="flex items-start justify-between px-5 pt-6 pb-3 relative z-10">
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-accent opacity-40">
            {t('agentStudio.header.eyebrow')}
          </span>
          <h2 className="text-[17px] font-black text-text tracking-tighter leading-none">
            {t('agentStudio.header.title')}
          </h2>
        </div>
        <motion.button
          whileHover={{ scale: 1.05, x: 2 }}
          whileTap={{ scale: 0.95 }}
          onClick={toggleWorkspace}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-secondary/60 text-text-tertiary hover:text-accent transition-all duration-500 shadow-sm border border-black/5 dark:border-white/5 mt-0.5"
        >
          <ChevronRight size={14} strokeWidth={2.5} />
        </motion.button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 scrollbar-subtle">
        <div className="space-y-4 pb-4">
          {feedback && (
            <div className="rounded-[22px] border border-accent/15 bg-accent/8 px-4 py-3 text-[11px] font-medium text-accent">
              {feedback}
            </div>
          )}

          {panelMode === 'list' ? (
            <div className="rounded-[28px] border border-border-light/60 bg-white/76 p-5 shadow-sm backdrop-blur-xl dark:bg-white/5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[12px] font-black tracking-tight text-text">
                    {t('agentStudio.list.title')}
                  </div>
                </div>
                <button
                  onClick={() => setShowCreateAgentModal(true)}
                  className="rounded-full bg-accent px-3 py-1.5 text-[10px] font-black text-white shadow-sm shadow-accent/15 transition-all duration-300 hover:-translate-y-0.5"
                >
                  {t('agentStudio.list.new')}
                </button>
              </div>

              <div className="space-y-2.5">
                {agents.length === 0 ? (
                  <div className="rounded-2xl bg-surface-secondary/45 px-4 py-6 text-center text-[11px] text-text-tertiary">
                    {t('agentStudio.list.emptyState')}
                  </div>
                ) : (
                  agents.map((agent) => {
                    const selected = agent.id === activeAgentId
                    return (
                      <div
                        key={agent.id}
                        className={`group rounded-[22px] border px-3 py-3 transition-all duration-300 ${
                          selected
                            ? 'border-accent/20 bg-accent/10 shadow-[0_12px_30px_rgba(69,116,255,0.08)]'
                            : 'border-border-light/60 bg-surface-secondary/50 hover:-translate-y-0.5 hover:border-accent/15 hover:bg-white/80'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <button
                            onClick={() => {
                              setConfirmDeleteAgentId(null)
                              setActiveAgent(agent.id)
                              setPanelMode('detail')
                            }}
                            className="min-w-0 flex-1 rounded-[18px] text-left"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className={`truncate text-[12px] font-black tracking-tight ${
                                  selected ? 'text-accent' : 'text-text'
                                }`}>
                                  {agent.name}
                                </div>
                                <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-text-tertiary">
                                  {agent.description || t('agentStudio.list.noDescription')}
                                </div>
                              </div>
                              <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-[10px] font-black transition-all duration-300 ${
                                selected
                                  ? 'bg-white/85 text-accent'
                                  : 'bg-white/75 text-text-secondary group-hover:bg-accent/10 group-hover:text-accent'
                              }`}>
                                {selected ? t('agentStudio.list.current') : t('agentStudio.list.details')}
                                <ChevronRight size={12} strokeWidth={2.5} />
                              </span>
                            </div>
                            <div className="mt-2 flex items-center justify-between gap-3">
                              <span className="text-[10px] font-medium text-text-tertiary">
                                {selected ? t('agentStudio.list.currentHint') : t('agentStudio.list.clickHint')}
                              </span>
                            </div>
                          </button>
                          {confirmDeleteAgentId === agent.id ? (
                            <div className="flex shrink-0 flex-col gap-1.5">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteAgent(agent.id, agent.name)
                                }}
                                className="rounded-full bg-red-500 px-2.5 py-1 text-[10px] font-black text-white transition-all duration-300 hover:bg-red-600"
                                title={t('agentStudio.list.deleteConfirm', { name: agent.name })}
                              >
                                {t('common.confirm')}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setConfirmDeleteAgentId(null)
                                }}
                                className="rounded-full bg-white/75 px-2.5 py-1 text-[10px] font-black text-text-tertiary transition-all duration-300 hover:text-text dark:bg-white/10"
                              >
                                {t('common.cancel')}
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteAgent(agent.id, agent.name)
                              }}
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/72 text-text-tertiary transition-all duration-300 hover:bg-red-50 hover:text-red-500 dark:bg-white/10 dark:hover:bg-red-500/10"
                              title={t('agentStudio.list.delete')}
                            >
                              <Trash2 size={14} strokeWidth={2.2} />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-[28px] border border-border-light/60 bg-white/76 p-5 shadow-sm backdrop-blur-xl dark:bg-white/5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPanelMode('list')}
                    className="rounded-full bg-surface-secondary/70 px-3 py-1.5 text-[10px] font-black text-text-tertiary transition-all duration-300 hover:text-text"
                  >
                    {t('agentStudio.detail.back')}
                  </button>
                  <p className="text-[12px] font-black tracking-tight text-text">
                    {t('agentStudio.detail.title')}
                  </p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/8 text-accent">
                  <AssemblyGlyph className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {activeAgent && (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-black tracking-[0.08em] text-accent">
                        {t('agentStudio.detail.usingNow')}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-secondary/65 px-2.5 py-1 text-[10px] font-bold text-text-secondary">
                        <Cpu size={11} className="text-accent" />
                        {providerModel}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={activeAgent.name}
                      onChange={(e) => updateAgent(activeAgent.id, { name: e.target.value })}
                      placeholder={t('agentStudio.currentAgent.namePlaceholder')}
                      className="w-full rounded-2xl border border-border-light bg-surface-secondary/55 px-3 py-3 text-[12px] font-semibold text-text outline-none transition-all focus:border-accent/30"
                    />
                    <input
                      type="text"
                      value={activeAgent.description}
                      onChange={(e) => updateAgent(activeAgent.id, { description: e.target.value })}
                      placeholder={t('agentStudio.currentAgent.descriptionPlaceholder')}
                      className="w-full rounded-2xl border border-border-light bg-surface-secondary/55 px-3 py-3 text-[12px] text-text-secondary outline-none transition-all focus:border-accent/30"
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setShowSkillPicker(true)}
                        className="rounded-xl bg-surface-secondary/70 px-3 py-2.5 text-[11px] font-black text-text transition-all duration-300 hover:bg-accent/10 hover:text-accent"
                      >
                        {t('agentStudio.detail.addSkill')}
                      </button>
                      <button
                        onClick={() => setShowMcpPicker(true)}
                        className="rounded-xl bg-surface-secondary/70 px-3 py-2.5 text-[11px] font-black text-text transition-all duration-300 hover:bg-accent/10 hover:text-accent"
                      >
                        {t('agentStudio.detail.addMcp')}
                      </button>
                      <button
                        onClick={() => handleComingSoon('knowledge')}
                        className="rounded-xl bg-surface-secondary/70 px-3 py-2.5 text-[11px] font-black text-text transition-all duration-300 hover:bg-accent/10 hover:text-accent"
                      >
                        {t('agentStudio.detail.addKnowledge')}
                      </button>
                      <button
                        onClick={() => handleComingSoon('memory')}
                        className="rounded-xl bg-surface-secondary/70 px-3 py-2.5 text-[11px] font-black text-text transition-all duration-300 hover:bg-accent/10 hover:text-accent"
                      >
                        {t('agentStudio.detail.addMemory')}
                      </button>
                    </div>

                    <button
                      onClick={handleAttachWorkspace}
                      disabled={!workspaceDir}
                      className="rounded-xl bg-accent px-3 py-2.5 text-[11px] font-black text-white shadow-lg shadow-accent/10 transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-40"
                    >
                      {t('agentStudio.detail.attachWorkspace')}
                    </button>

                    <div className="grid grid-cols-3 gap-2">
                      {moduleStats.map((stat) => (
                        <MinimalStat key={stat.label} label={stat.label} value={stat.value} />
                      ))}
                    </div>

                    <TagPanel
                      title={t('agentStudio.assembly.skills')}
                      items={visibleSkillNames.map((name) => `${skillMeta[name]?.emoji || '✦'} ${name}`)}
                      emptyText={t('agentStudio.assembly.emptySkills')}
                      removableItems={activeAgent ? visibleSkillNames.map((name) => ({
                        key: name,
                        label: `${skillMeta[name]?.emoji || '✦'} ${name}`,
                        onRemove: () => {
                          removeSkillFromAgent(activeAgent.id, name)
                          setFeedback(t('agentStudio.feedback.skillRemoved', { name }))
                        },
                      })) : undefined}
                    />
                    <TagPanel
                      title={t('agentStudio.assembly.mcpServers')}
                      items={visibleServerNames}
                      emptyText={t('agentStudio.assembly.emptyServers')}
                      removableItems={activeAgent ? visibleServerNames.map((name) => ({
                        key: name,
                        label: name,
                        onRemove: () => {
                          removeMCPServerFromAgent(activeAgent.id, name)
                          setFeedback(t('agentStudio.feedback.mcpRemoved', { name }))
                        },
                      })) : undefined}
                    />
                    <SimpleSection
                      title={t('agentStudio.assembly.workspacePaths')}
                      value={workspaceEntries.length > 0 ? workspaceEntries.join(' · ') : t('agentStudio.assembly.emptyPaths')}
                      icon={<MemoryGlyph className="h-4 w-4" />}
                      action={activeAgent && workspaceEntries.length > 0
                        ? {
                            label: t('common.clear'),
                            onClick: () => {
                              workspaceEntries.forEach((path) => removeAccessiblePath(activeAgent.id, path))
                              setFeedback(t('agentStudio.feedback.workspaceCleared'))
                            },
                          }
                        : undefined}
                    />
                    <div className="rounded-[24px] border border-border-light/70 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:bg-white/5">
                      <button
                        onClick={() => setShowDetailAdvanced((prev) => !prev)}
                        className="flex w-full items-center justify-between gap-3 text-left"
                      >
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-accent/70">
                            {t('agentStudio.advanced.title')}
                          </div>
                          <p className="mt-1 text-[10px] text-text-tertiary">
                            {t('agentStudio.advanced.agentScoped')}
                          </p>
                        </div>
                        <span className="rounded-full bg-surface-secondary/65 px-3 py-1 text-[10px] font-black tracking-[0.08em] text-text-tertiary">
                          {showDetailAdvanced ? t('agentStudio.advanced.hide') : t('agentStudio.advanced.show')}
                        </span>
                      </button>

                      {showDetailAdvanced && (
                        <div className="mt-4 space-y-3">
                          <textarea
                            value={activeAgent.instructions}
                            onChange={(e) => updateAgent(activeAgent.id, { instructions: e.target.value })}
                            placeholder={t('agentStudio.advanced.instructionsPlaceholder')}
                            rows={4}
                            className="w-full resize-none rounded-2xl border border-border-light bg-surface-secondary/55 px-3 py-3 text-[12px] text-text-secondary outline-none transition-all focus:border-accent/30"
                          />
                          <input
                            type="text"
                            value={activeAgent.model}
                            onChange={(e) => updateAgent(activeAgent.id, { model: e.target.value })}
                            placeholder={t('agentStudio.advanced.modelPlaceholder')}
                            className="w-full rounded-2xl border border-border-light bg-surface-secondary/55 px-3 py-3 text-[12px] text-text-secondary outline-none transition-all focus:border-accent/30"
                          />
                          <select
                            value={activeAgent.permissionMode}
                            onChange={(e) => updateAgent(activeAgent.id, {
                              permissionMode: e.target.value as 'ask' | 'allow' | 'deny',
                            })}
                            className="w-full rounded-2xl border border-border-light bg-surface-secondary/55 px-3 py-3 text-[12px] font-semibold text-text outline-none transition-all focus:border-accent/30"
                          >
                            <option value="ask">{t('common.ask')}</option>
                            <option value="allow">{t('common.allow')}</option>
                            <option value="deny">{t('common.deny')}</option>
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {!activeAgent && (
                  <div className="rounded-2xl bg-surface-secondary/45 px-4 py-6 text-center text-[11px] text-text-tertiary">
                    {t('agentStudio.detail.emptyState')}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </div>

      {showSkillPicker && (
        <PickerModal
          title={t('agentStudio.quickInstall.skills')}
          emptyText={t('agentStudio.quickInstall.noSkills')}
          initialActiveTab="discover"
          onClose={() => setShowSkillPicker(false)}
          localItems={installableSkills.map((skill) => ({
            key: skill.name,
            title: `${skillMeta[skill.name]?.emoji || '✦'} ${skill.name}`,
            subtitle: skill.description || skill.location,
            actionLabel: t('agentStudio.library.mountNow'),
            onClick: () => handleInstallSkill(skill.name),
            badges: [t('agentStudio.library.localBadge'), 'Skill'],
          }))}
          discoverItems={remoteSkills.map((skill) => ({
            key: skill.id,
            title: skill.name,
            subtitle: skill.description,
            actionLabel: t('agentStudio.library.remoteInstall'),
            onClick: () => void handleRemoteInstallSkill(skill),
            badges: [
              'skills.sh',
              ...(skill.owner ? [skill.owner] : []),
              ...(typeof skill.downloads === 'number' ? [`${skill.downloads >= 1000 ? (skill.downloads / 1000).toFixed(1) + 'K' : skill.downloads} installs`] : []),
            ],
            busy: busyInstallKey === skill.id,
          }))}
          discoverLoading={remoteSkillsLoading}
          discoverError={remoteSkillsError}
          discoverEmptyText={t('agentStudio.library.remoteEmpty')}
          onDiscoverSearch={(value) => {
            void fetchRemoteSkills(value)
          }}
        />
      )}

      {showMcpPicker && (
        <PickerModal
          title={t('agentStudio.quickInstall.mcp')}
          emptyText={t('agentStudio.quickInstall.noMcp')}
          onClose={() => setShowMcpPicker(false)}
          localItems={installableMcpServers.map((server) => ({
            key: server.name,
            title: server.name,
            subtitle: server.type === 'stdio' ? (server.command || 'stdio') : (server.url || server.type),
            actionLabel: t('agentStudio.library.mountNow'),
            onClick: () => handleInstallMcp(server.name),
            badges: [t('agentStudio.library.localBadge'), 'MCP', server.type],
          }))}
          discoverItems={discoverableMcps.map((mcp) => ({
            key: mcp.id,
            title: mcp.name,
            subtitle: mcp.description,
            actionLabel: t('agentStudio.library.remoteInstall'),
            onClick: () => void handleRemoteInstallMcp(mcp),
            badges: [mcp.source, mcp.type, mcp.installMode],
            busy: busyInstallKey === mcp.id,
          }))}
        />
      )}

      {showCreateAgentModal && (
        <CreateAgentModal
          title={t('agentStudio.currentAgent.create')}
          nameValue={newAgentName}
          descriptionValue={newAgentDescription}
          instructionsValue={newAgentInstructions}
          modelValue={newAgentModel}
          permissionModeValue={newAgentPermissionMode}
          showAdvanced={showCreateAdvanced}
          onNameChange={setNewAgentName}
          onDescriptionChange={setNewAgentDescription}
          onInstructionsChange={setNewAgentInstructions}
          onModelChange={setNewAgentModel}
          onPermissionModeChange={setNewAgentPermissionMode}
          onToggleAdvanced={() => setShowCreateAdvanced((prev) => !prev)}
          onClose={() => {
            setShowCreateAgentModal(false)
            resetCreateAgentDraft()
          }}
          onSubmit={handleCreateAgent}
        />
      )}
    </aside>
  )
}

function SimpleSection({
  icon,
  title,
  value,
  action,
}: {
  icon: ReactElement
  title: string
  value: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="rounded-[22px] bg-surface-secondary/45 px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-accent">{icon}</span>
          <span className="text-[10px] font-black tracking-[0.08em] text-accent/70">
            {title}
          </span>
        </div>
        {action && (
          <button
            onClick={action.onClick}
            className="rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-black text-text-tertiary transition-all duration-300 hover:text-red-500 dark:bg-white/10"
          >
            {action.label}
          </button>
        )}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-text-secondary">
        {value}
      </p>
    </div>
  )
}

function MinimalStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface-secondary/55 px-3 py-3">
      <div className="text-[9px] font-black uppercase tracking-[0.1em] text-text-tertiary">
        {label}
      </div>
      <div className="mt-1 text-[16px] font-black tracking-tight text-text">
        {value}
      </div>
    </div>
  )
}

function TagPanel({
  title,
  items,
  emptyText,
  interactiveItems,
  removableItems,
}: {
  title: string
  items: string[]
  emptyText: string
  interactiveItems?: Array<{ key: string; label: string; onClick: () => void }>
  removableItems?: Array<{ key: string; label: string; onRemove: () => void }>
}) {
  return (
    <div className="rounded-[24px] border border-border-light/70 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:bg-white/5">
      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-accent/70">
        {title}
      </div>
      {interactiveItems && interactiveItems.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {interactiveItems.map((item) => (
            <button
              key={item.key}
              onClick={item.onClick}
              className="inline-flex items-center rounded-full bg-surface-secondary/60 px-3 py-1.5 text-[11px] font-medium text-text-secondary transition-all duration-300 hover:bg-accent/10 hover:text-accent"
            >
              + {item.label}
            </button>
          ))}
        </div>
      ) : removableItems && removableItems.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {removableItems.map((item) => (
            <button
              key={item.key}
              onClick={item.onRemove}
              className="inline-flex items-center rounded-full border border-border-light bg-surface-secondary/50 px-3 py-1.5 text-[11px] font-medium text-text-secondary transition-all duration-300 hover:border-red-200 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
            >
              {item.label} <span className="ml-1.5 text-[12px]">×</span>
            </button>
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="mt-2.5 text-[11px] leading-relaxed text-text-tertiary">
          {emptyText}
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={item}
              className="inline-flex items-center rounded-full border border-border-light bg-surface-secondary/50 px-3 py-1.5 text-[11px] font-medium text-text-secondary"
            >
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function PickerModal({
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

function CreateAgentModal({
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

function SvgWrap({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      {children}
    </svg>
  )
}

function CoreGlyph({ className }: { className?: string }) {
  return (
    <SvgWrap className={className}>
      <rect x="5.5" y="5.5" width="13" height="13" rx="4" stroke="currentColor" strokeWidth="1.8" />
      <rect x="9" y="9" width="6" height="6" rx="1.8" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.1 5.9 16 8M8 16 5.9 18.1M18.1 18.1 16 16M8 8 5.9 5.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </SvgWrap>
  )
}

function MemoryGlyph({ className }: { className?: string }) {
  return (
    <SvgWrap className={className}>
      <path d="M7.5 6.3h7a3.2 3.2 0 0 1 3.2 3.2v6.1a2.8 2.8 0 0 1-2.8 2.8h-7a3.2 3.2 0 0 1-3.2-3.2V8.9a2.6 2.6 0 0 1 2.6-2.6Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 10h5.8M8.5 13h5.8M8.5 16h3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </SvgWrap>
  )
}

function AssemblyGlyph({ className }: { className?: string }) {
  return (
    <SvgWrap className={className}>
      <rect x="4.8" y="6.2" width="5.2" height="5.2" rx="1.6" stroke="currentColor" strokeWidth="1.7" />
      <rect x="14" y="6.2" width="5.2" height="5.2" rx="1.6" stroke="currentColor" strokeWidth="1.7" />
      <rect x="9.4" y="14.2" width="5.2" height="5.2" rx="1.6" stroke="currentColor" strokeWidth="1.7" />
      <path d="M10 8.8h4M12 11.4v2.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </SvgWrap>
  )
}
