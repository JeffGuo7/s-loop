import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChevronRight,
  Cpu,
  Sparkles,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { useAgentStore, useAppStore } from '../../stores'
import { useMCPStore } from '../../stores/mcpStore'
import { useSkillStore } from '../../stores/skillStore'

const AGENT_VISUAL_SRC = '/pets/cloudling/assets/cloudling-mini-idle.svg'

export function WorkspacePanel() {
  const { t } = useTranslation()
  const workspaceDir = useAppStore((s) => s.workspaceDir)
  const { workspaceCollapsed: collapsed, toggleWorkspace, providerConfigs, activeProvider } = useAppStore()
  const agents = useAgentStore((s) => s.agents)
  const activeAgentId = useAgentStore((s) => s.activeAgentId)
  const skills = useSkillStore((s) => s.skills)
  const skillMeta = useSkillStore((s) => s.skillMeta)
  const mcpServers = useMCPStore((s) => s.servers)
  const mcpStatuses = useMCPStore((s) => s.serverStatuses)

  const activeAgent = agents.find((agent) => agent.id === activeAgentId) ?? null
  const enabledSkills = skills.filter((skill) => skill.enabled)
  const connectedServerNames = Object.entries(mcpStatuses)
    .filter(([, status]) => status?.status === 'connected')
    .map(([name]) => name)

  const displayAgent = useMemo(() => {
    if (activeAgent) return activeAgent

    return {
      id: 'mock-agent',
      name: 'Snotra Orchestrator',
      description: t('agentPanel.mockDescription'),
      avatar: '',
      instructions: t('agentPanel.mockSoulPrompt'),
      model: '',
      skills: enabledSkills.slice(0, 3).map((skill) => skill.name),
      mcpTools: connectedServerNames.slice(0, 2).map((serverName) => ({
        serverName,
        toolName: 'context',
      })),
      mcpServers: connectedServerNames.slice(0, 3),
      accessiblePaths: workspaceDir ? [workspaceDir] : [],
      permissionMode: 'ask' as const,
      permissionRules: {},
      slashCommands: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
  }, [activeAgent, connectedServerNames, enabledSkills, t, workspaceDir])

  const visibleSkillNames = displayAgent.skills.length > 0
    ? displayAgent.skills
    : enabledSkills.slice(0, 4).map((skill) => skill.name)
  const visibleServerNames = displayAgent.mcpServers.length > 0
    ? displayAgent.mcpServers
    : connectedServerNames.slice(0, 4)
  const visibleToolNames = displayAgent.mcpTools.length > 0
    ? displayAgent.mcpTools.map((tool) => `${tool.serverName}.${tool.toolName}`)
    : Object.entries(mcpStatuses)
        .flatMap(([serverName, status]) => (status.tools || []).slice(0, 2).map((tool) => `${serverName}.${tool.name}`))
        .slice(0, 6)
  const workspaceEntries = displayAgent.accessiblePaths.length > 0
    ? displayAgent.accessiblePaths
    : workspaceDir
      ? [workspaceDir]
      : []
  const providerModel = displayAgent.model || providerConfigs[activeProvider]?.model || t('chat.status.noModel')
  const agentRoster = agents.length > 0
    ? agents.slice(0, 4).map((agent) => ({ label: agent.name, active: agent.id === activeAgentId }))
    : [
        { label: 'Snotra Orchestrator', active: true },
        { label: 'Flow Runner', active: false },
        { label: 'Code Analyst', active: false },
      ]
  const moduleStats = [
    { label: t('agentPanel.skills'), value: String(visibleSkillNames.length) },
    { label: 'MCP', value: String(Math.max(visibleServerNames.length, mcpServers.length)) },
    { label: t('agentPanel.workspaceSection'), value: String(workspaceEntries.length) },
  ]

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
          title={t('agentPanel.tooltip')}
        >
          <img src={AGENT_VISUAL_SRC} alt="" className="h-5 w-5 object-contain" />
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
            {t('agentPanel.eyebrow')}
          </span>
          <h2 className="text-[17px] font-black text-text tracking-tighter leading-none">
            {t('agentPanel.title')}
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
        <div className="space-y-3 pb-4">
          <div className="rounded-[28px] border border-border-light/70 bg-white/72 p-4 shadow-[0_16px_40px_rgba(0,0,0,0.05)] backdrop-blur-2xl dark:bg-white/5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/8 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-accent">
                  <Sparkles size={11} strokeWidth={2.2} />
                  {activeAgent ? t('agentPanel.currentAgent') : t('agentPanel.mockState')}
                </div>

                <div className="mt-3 flex items-start gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] border border-accent/15 bg-linear-to-br from-accent/10 to-white/80 shadow-inner shadow-accent/10 dark:to-white/5">
                    <img src={AGENT_VISUAL_SRC} alt="" className="h-9 w-9 object-contain" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-[18px] font-black tracking-tight text-text">
                          {displayAgent.name}
                        </h3>
                        <p className="mt-1 text-[11px] leading-relaxed text-text-tertiary">
                          {displayAgent.description || t('agentPanel.descriptionFallback')}
                        </p>
                      </div>

                      <div className="shrink-0 rounded-2xl border border-border-light/70 bg-surface-secondary/70 px-3 py-2">
                        <div className="text-[9px] font-black uppercase tracking-[0.14em] text-accent/65">
                          {t('agentPanel.runtime')}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] font-bold text-text">
                          <Cpu size={12} className="text-accent" />
                          <span className="max-w-[110px] truncate">{providerModel}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 rounded-2xl border border-border-light/70 bg-surface-secondary/55 px-3 py-2.5">
                      <div className="text-[9px] font-black uppercase tracking-[0.12em] text-accent/65">
                        {t('agentPanel.soulSection')}
                      </div>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-text-secondary">
                        {displayAgent.instructions || t('agentPanel.soulHint')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {moduleStats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-border-light/70 bg-surface-secondary/55 px-3 py-2.5">
                  <div className="text-[9px] font-black uppercase tracking-[0.12em] text-text-tertiary">
                    {stat.label}
                  </div>
                  <div className="mt-1 text-[16px] font-black tracking-tight text-text">
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[26px] border border-border-light/70 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:bg-white/5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-accent/70">
                  {t('agentPanel.moduleBoard')}
                </div>
                <div className="mt-1 text-[11px] text-text-tertiary">
                  {t('agentPanel.futureBuilder')}
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              <ModuleCard
                title={t('agentPanel.skillSection')}
                description={visibleSkillNames.length > 0 ? visibleSkillNames.join(' · ') : t('agentPanel.skillsHint')}
              />
              <div className="grid grid-cols-2 gap-2.5">
                <ModuleCard
                  title={t('agentPanel.serverSection')}
                  description={visibleServerNames.length > 0 ? visibleServerNames.join(' · ') : t('agentPanel.mcpHint')}
                />
                <ModuleCard
                  title={t('agentPanel.toolSection')}
                  description={visibleToolNames.length > 0 ? visibleToolNames.join(' · ') : t('agentPanel.toolHint')}
                />
              </div>
              <ModuleCard
                title={t('agentPanel.workspaceSection')}
                description={workspaceEntries.length > 0 ? workspaceEntries.join(' · ') : t('agentPanel.workspaceHint')}
                mono
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <TagPanel
              title={t('agentPanel.skillSection')}
              items={visibleSkillNames.map((name) => `${skillMeta[name]?.emoji || '✦'} ${name}`)}
              emptyText={t('agentPanel.skillsHint')}
            />
            <TagPanel
              title={t('agentPanel.toolSection')}
              items={visibleToolNames}
              emptyText={t('agentPanel.toolHint')}
            />
          </div>

          <div className="rounded-[26px] border border-border-light/70 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:bg-white/5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-accent/70">
                  {t('agentPanel.presets')}
                </p>
                <p className="mt-1 text-[11px] font-medium text-text-tertiary">
                  {t('agentPanel.presetHint')}
                </p>
              </div>
              <div className="rounded-full border border-border-light bg-surface-secondary/60 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-text-tertiary">
                {agents.length > 0 ? `${agents.length} ${t('agentPanel.agentsUnit')}` : t('agentPanel.mockOnly')}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {agentRoster.map((agent) => (
                <div
                  key={agent.label}
                  className={`flex items-center justify-between rounded-2xl border px-3 py-2.5 text-[11px] font-bold tracking-tight transition-all ${
                    agent.active
                      ? 'border-accent/20 bg-accent/10 text-accent shadow-sm'
                      : 'border-border-light bg-surface-secondary/50 text-text-secondary'
                  }`}
                >
                  <span>{agent.label}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] ${
                    agent.active ? 'bg-white/70 text-accent' : 'bg-white/60 text-text-tertiary dark:bg-white/10'
                  }`}>
                    {agent.active ? t('agentPanel.liveConfig') : t('agentPanel.mockOnly')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}

function ModuleCard({
  title,
  description,
  mono = false,
}: {
  title: string
  description: string
  mono?: boolean
}) {
  return (
    <div className="rounded-2xl border border-border-light/70 bg-surface-secondary/45 px-3.5 py-3">
      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-accent/70">
        {title}
      </div>
      <p className={`mt-2 text-[11px] leading-relaxed text-text-secondary ${mono ? 'font-mono' : 'font-medium'}`}>
        {description}
      </p>
    </div>
  )
}

function TagPanel({
  title,
  items,
  emptyText,
}: {
  title: string
  items: string[]
  emptyText: string
}) {
  return (
    <div className="rounded-[24px] border border-border-light/70 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:bg-white/5">
      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-accent/70">
        {title}
      </div>
      {items.length === 0 ? (
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
