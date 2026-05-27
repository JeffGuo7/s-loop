import { useSkillStore } from '../../../stores'

interface SkillChipProps {
  skillName: string
  selected?: boolean
  onClick?: () => void
}

export function SkillChip({ skillName, selected, onClick }: SkillChipProps) {
  const skill = useSkillStore((s) => s.skills.find((sk) => sk.name === skillName))

  return (
    <button
      onClick={onClick}
      className={`group flex items-center gap-2 w-full px-3 py-2 rounded-xl text-left transition-all duration-300 ${
        selected
          ? 'bg-accent/10 border border-accent/30'
          : 'hover:bg-surface-secondary/60 border border-transparent'
      }`}
    >
      <div
        className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
          selected ? 'bg-accent' : 'bg-text-tertiary/30'
        }`}
      />
      <div className="min-w-0 flex-1">
        <span className={`text-[11px] font-bold block truncate ${selected ? 'text-accent' : 'text-text-secondary'}`}>
          {skill?.name || skillName}
        </span>
        {skill?.description && (
          <span className="text-[9px] text-text-tertiary/60 block truncate mt-0.5">
            {skill.description}
          </span>
        )}
      </div>
    </button>
  )
}

interface MCPToolChipProps {
  serverName: string
  toolName: string
  selected?: boolean
  onClick?: () => void
}

export function MCPToolChip({ serverName, toolName, selected, onClick }: MCPToolChipProps) {
  return (
    <button
      onClick={onClick}
      className={`group flex items-center gap-2 w-full px-3 py-2 rounded-xl text-left transition-all duration-300 ${
        selected
          ? 'bg-accent/10 border border-accent/30'
          : 'hover:bg-surface-secondary/60 border border-transparent'
      }`}
    >
      <div
        className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
          selected ? 'bg-accent' : 'bg-text-tertiary/30'
        }`}
      />
      <div className="min-w-0 flex-1">
        <span className={`text-[11px] font-bold block truncate ${selected ? 'text-accent' : 'text-text-secondary'}`}>
          {toolName}
        </span>
        <span className="text-[9px] text-text-tertiary/50 block truncate mt-0.5 font-mono">
          {serverName}
        </span>
      </div>
    </button>
  )
}

interface MCPServerChipProps {
  serverName: string
  selected?: boolean
  onClick?: () => void
}

export function MCPServerChip({ serverName, selected, onClick }: MCPServerChipProps) {
  return (
    <button
      onClick={onClick}
      className={`group flex items-center gap-2 w-full px-3 py-2 rounded-xl text-left transition-all duration-300 ${
        selected
          ? 'bg-accent/10 border border-accent/30'
          : 'hover:bg-surface-secondary/60 border border-transparent'
      }`}
    >
      <div
        className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
          selected ? 'bg-accent' : 'bg-text-tertiary/30'
        }`}
      />
      <div className="min-w-0 flex-1">
        <span className={`text-[11px] font-bold block truncate ${selected ? 'text-accent' : 'text-text-secondary'}`}>
          {serverName}
        </span>
        <span className="text-[9px] text-text-tertiary/50 block truncate mt-0.5 font-mono">
          MCP Server
        </span>
      </div>
    </button>
  )
}
