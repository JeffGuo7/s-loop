import { useState } from 'react'
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
import { SubagentEditor } from '../skills/SubagentEditor'
import { AgentMemoryManager } from './AgentMemoryManager'
import {
  AssemblyGlyph,
  CoreGlyph,
  MemoryGlyph,
  MinimalStat,
  SimpleSection,
  TagPanel,
} from './AgentStudioAtoms'
import { ConfirmRemoveModal, CreateAgentModal, PickerModal } from './AgentModals'

export function WorkspacePanel() {
  const { t } = useTranslation()
  const [feedback, setFeedback] = useState<string | null>(null)
  const [showSkillPicker, setShowSkillPicker] = useState(false)
  const [showMcpPicker, setShowMcpPicker] = useState(false)
  const [showCreateAgentModal, setShowCreateAgentModal] = useState(false)
  const [showCreateAdvanced, setShowCreateAdvanced] = useState(false)
  const [showDetailAdvanced, setShowDetailAdvanced] = useState(false)
  const [confirmDeleteAgentId, setConfirmDeleteAgentId] = useState<string | null>(null)
  const [confirmRemoveSkillName, setConfirmRemoveSkillName] = useState<string | null>(null)
  const [confirmRemoveMcpServer, setConfirmRemoveMcpServer] = useState<string | null>(null)
  const [busyInstallKey, setBusyInstallKey] = useState<string | null>(null)
  const [remoteSkillsLoading, setRemoteSkillsLoading] = useState(false)
  const [remoteSkillsError, setRemoteSkillsError] = useState<string | null>(null)
  const [remoteSkills, setRemoteSkills] = useState<Array<{
    id: string
    slug: string
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
  const userProfile = useAgentStore((s) => s.userProfile)
  const updateUserProfile = useAgentStore((s) => s.updateUserProfile)
  const deleteAgent = useAgentStore((s) => s.deleteAgent)
  const addSkillToAgent = useAgentStore((s) => s.addSkillToAgent)
  const removeSkillFromAgent = useAgentStore((s) => s.removeSkillFromAgent)
  const addMCPServerToAgent = useAgentStore((s) => s.addMCPServerToAgent)
  const removeMCPServerFromAgent = useAgentStore((s) => s.removeMCPServerFromAgent)
  const addWorkspaceRoot = useAgentStore((s) => s.addWorkspaceRoot)
  const removeWorkspaceRoot = useAgentStore((s) => s.removeWorkspaceRoot)
  const skills = useSkillStore((s) => s.skills)
  const skillMeta = useSkillStore((s) => s.skillMeta)
  const clawhubSearch = useSkillStore((s) => s.clawhubSearch)
  const clawhubInstall = useSkillStore((s) => s.clawhubInstall)
  const mcpServers = useMCPStore((s) => s.servers)
  const installRemoteServer = useMCPStore((s) => s.installRemoteServer)

  const activeAgent = agents.find((agent) => agent.id === activeAgentId) ?? null
  const visibleSkillNames = activeAgent?.skills ?? []
  const visibleServerNames = activeAgent?.mcpServers ?? []
  const workspaceEntries = activeAgent?.workspaceRoots ?? []
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
    addWorkspaceRoot(target.id, workspaceDir, 'read-write', 'workspace')
    setActiveAgent(target.id)
    setFeedback(t('agentStudio.feedback.workspaceAttached'))
  }

  function handleComingSoon(kind: 'knowledge' | 'memory' | 'remote') {
    if (kind === 'knowledge') {
      setFeedback(t('agentStudio.feedback.knowledgeComingSoon'))
      return
    }
    if (kind === 'memory') {
      setShowDetailAdvanced(true)
      setFeedback(t('agentStudio.feedback.memoryReviewReady'))
      return
    }
    setFeedback(t('agentStudio.feedback.remoteComingSoon'))
  }

  async function handleRemoteInstallSkill(item: {
    id: string
    slug: string
    source: string
    name: string
  }) {
    setBusyInstallKey(item.id)
    try {
      const result = await clawhubInstall(item.slug, item.name)

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
      const list = await clawhubSearch(query)
      setRemoteSkills(list.map((item) => ({
        id: item.id,
        slug: item.slug,
        source: item.slug,
        name: item.name,
        description: item.description + (item.downloads && item.downloads > 0 ? ` · ${item.downloads >= 1000 ? (item.downloads / 1000).toFixed(1) + 'K' : item.downloads} installs` : ''),
        owner: item.owner ?? undefined,
        downloads: item.downloads ?? undefined,
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
      rules: newAgentInstructions.trim(),
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
        className="h-full flex flex-col items-center pt-[58px] bg-surface-secondary/35 sidebar-transition relative shrink-0"
        style={{ width: 'var(--spacing-workspace-panel-collapsed)' }}
      >
        <motion.button
          onClick={toggleWorkspace}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface text-accent border border-border transition-colors duration-150 hover:bg-accent-subtle"
          title={t('agentStudio.header.panelTooltip')}
        >
          <CoreGlyph className="h-5 w-5" />
        </motion.button>
      </aside>
    )
  }

  return (
    <aside 
      className="h-full flex flex-col overflow-hidden shrink-0 sidebar-transition bg-surface-secondary/30 relative pt-[42px]"
      style={{ width: 'var(--spacing-workspace-panel)' }}
    >
      <div className="flex items-start justify-between px-5 pt-5 pb-4 relative z-10">
        <div className="flex flex-col gap-0.5">
          <span className="section-eyebrow">
            {t('agentStudio.header.eyebrow')}
          </span>
          <h2 className="text-[17px] font-semibold text-text tracking-[-0.02em] leading-none">
            {t('agentStudio.header.title')}
          </h2>
        </div>
        <motion.button
          onClick={toggleWorkspace}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface text-text-tertiary hover:text-accent transition-colors duration-150 border border-border mt-0.5"
        >
          <ChevronRight size={14} strokeWidth={2.5} />
        </motion.button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 scrollbar-subtle">
        <div className="space-y-4 pb-4">
          {feedback && (
            <div className="rounded-lg border border-accent/15 bg-accent/8 px-3 py-2.5 text-[11px] font-medium text-accent">
              {feedback}
            </div>
          )}

          {panelMode === 'list' ? (
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[12px] font-semibold tracking-tight text-text">
                    {t('agentStudio.list.title')}
                  </div>
                </div>
                <button
                  onClick={() => setShowCreateAgentModal(true)}
                  className="rounded-lg bg-accent px-3 py-1.5 text-[10px] font-semibold text-accent-foreground transition-colors duration-150 hover:bg-accent-light"
                >
                  {t('agentStudio.list.new')}
                </button>
              </div>

              <div className="space-y-2.5">
                {agents.length === 0 ? (
                  <div className="rounded-lg border border-border bg-surface-secondary/45 px-4 py-6 text-center text-[11px] text-text-tertiary">
                    {t('agentStudio.list.emptyState')}
                  </div>
                ) : (
                  agents.map((agent) => {
                    const selected = agent.id === activeAgentId
                    return (
                      <div
                        key={agent.id}
                        className={`group relative rounded-lg border px-3 py-3 transition-colors duration-150 ${
                          selected
                            ? 'border-accent/30 bg-accent-subtle before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:bg-accent'
                            : 'border-border bg-surface-secondary/50 hover:border-accent/20 hover:bg-surface-secondary'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <button
                            onClick={() => {
                              setConfirmDeleteAgentId(null)
                              setActiveAgent(agent.id)
                              setPanelMode('detail')
                            }}
                            className="min-w-0 flex-1 rounded-md text-left"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className={`truncate text-[12px] font-semibold tracking-tight ${
                                  selected ? 'text-accent' : 'text-text'
                                }`}>
                                  {agent.name}
                                </div>
                                <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-text-tertiary">
                                  {agent.description || t('agentStudio.list.noDescription')}
                                </div>
                              </div>
                              <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold transition-colors duration-150 ${
                                selected
                                  ? 'bg-surface text-accent'
                                  : 'bg-surface text-text-secondary group-hover:bg-accent/10 group-hover:text-accent'
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
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface text-text-tertiary transition-colors duration-150 hover:bg-red-500/10 hover:text-red-500"
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
            <div className="rounded-xl border border-border bg-surface p-4">
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
                          setConfirmRemoveSkillName(name)
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
                          setConfirmRemoveMcpServer(name)
                        },
                      })) : undefined}
                    />
                    <SimpleSection
                      title={t('agentStudio.assembly.workspacePaths')}
                      value={workspaceEntries.length > 0
                        ? workspaceEntries.map((root) => `${root.path} [${root.access === 'read-write' ? 'RW' : 'RO'}]`).join(' · ')
                        : t('agentStudio.assembly.emptyPaths')}
                      icon={<MemoryGlyph className="h-4 w-4" />}
                      action={activeAgent && workspaceEntries.length > 0
                        ? {
                            label: t('common.clear'),
                            onClick: () => {
                              workspaceEntries.forEach((root) => removeWorkspaceRoot(activeAgent.id, root.id))
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
                            value={activeAgent.identity}
                            onChange={(e) => updateAgent(activeAgent.id, { identity: e.target.value })}
                            placeholder={t('agentStudio.advanced.identityPlaceholder')}
                            rows={4}
                            className="w-full resize-none rounded-2xl border border-border-light bg-surface-secondary/55 px-3 py-3 text-[12px] text-text-secondary outline-none transition-all focus:border-accent/30"
                          />
                          <textarea
                            value={activeAgent.soul}
                            onChange={(e) => updateAgent(activeAgent.id, { soul: e.target.value })}
                            placeholder={t('agentStudio.advanced.soulPlaceholder')}
                            rows={5}
                            className="w-full resize-none rounded-2xl border border-border-light bg-surface-secondary/55 px-3 py-3 text-[12px] text-text-secondary outline-none transition-all focus:border-accent/30"
                          />
                          <textarea
                            value={activeAgent.rules}
                            onChange={(e) => updateAgent(activeAgent.id, { rules: e.target.value })}
                            placeholder={t('agentStudio.advanced.rulesPlaceholder')}
                            rows={4}
                            className="w-full resize-none rounded-2xl border border-border-light bg-surface-secondary/55 px-3 py-3 text-[12px] text-text-secondary outline-none transition-all focus:border-accent/30"
                          />
                          <AgentMemoryManager agent={activeAgent} workspaceDir={workspaceDir ?? undefined} />
                          <select
                            value={activeAgent.conversationMode}
                            onChange={(e) => updateAgent(activeAgent.id, { conversationMode: e.target.value as 'work' | 'natural' | 'companion' })}
                            aria-label={t('agentStudio.advanced.modeLabel')}
                            className="w-full rounded-2xl border border-border-light bg-surface-secondary/55 px-3 py-3 text-[12px] font-semibold text-text outline-none transition-all focus:border-accent/30"
                          >
                            <option value="work">{t('agentStudio.advanced.modeWork')}</option>
                            <option value="natural">{t('agentStudio.advanced.modeNatural')}</option>
                            <option value="companion">{t('agentStudio.advanced.modeCompanion')}</option>
                          </select>
                          <textarea
                            value={userProfile}
                            onChange={(e) => updateUserProfile(e.target.value)}
                            placeholder={t('agentStudio.advanced.userPlaceholder')}
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
                        </div>
                      )}
                    </div>

                    {/* Sub-agent editor */}
                    <div className="rounded-[24px] border border-border-light/70 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:bg-white/5">
                      <SubagentEditor projectDir={workspaceDir ?? undefined} />
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
              'ClawHub',
              ...(skill.owner ? [skill.owner] : []),
              ...(typeof skill.downloads === 'number' && skill.downloads > 0 ? [`${skill.downloads >= 1000 ? (skill.downloads / 1000).toFixed(1) + 'K' : skill.downloads} installs`] : []),
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

      {(confirmRemoveSkillName || confirmRemoveMcpServer) && (
        <ConfirmRemoveModal
          title={confirmRemoveSkillName
            ? t('agentStudio.confirm.removeSkillTitle', { name: confirmRemoveSkillName })
            : t('agentStudio.confirm.removeMcpTitle', { name: confirmRemoveMcpServer })
          }
          message={confirmRemoveSkillName
            ? t('agentStudio.confirm.removeSkillMessage')
            : t('agentStudio.confirm.removeMcpMessage')
          }
          onConfirm={() => {
            if (confirmRemoveSkillName && activeAgent) {
              removeSkillFromAgent(activeAgent.id, confirmRemoveSkillName)
              setFeedback(t('agentStudio.feedback.skillRemoved', { name: confirmRemoveSkillName }))
              setConfirmRemoveSkillName(null)
            } else if (confirmRemoveMcpServer && activeAgent) {
              removeMCPServerFromAgent(activeAgent.id, confirmRemoveMcpServer)
              setFeedback(t('agentStudio.feedback.mcpRemoved', { name: confirmRemoveMcpServer }))
              setConfirmRemoveMcpServer(null)
            }
          }}
          onCancel={() => {
            setConfirmRemoveSkillName(null)
            setConfirmRemoveMcpServer(null)
          }}
        />
      )}
    </aside>
  )
}

