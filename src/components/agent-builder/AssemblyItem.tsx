import { X } from 'lucide-react'

interface AssemblyItemProps {
  type: 'skill' | 'mcp-tool' | 'mcp-server'
  label: string
  subtitle?: string
  onRemove: () => void
}

export function AssemblyItem({ type, label, subtitle, onRemove }: AssemblyItemProps) {
  return (
    <div className="group flex items-center gap-2.5 px-3 py-2 rounded-xl bg-surface-secondary/30 border border-border-light/30 transition-all duration-300 hover:bg-surface-secondary/50 hover:border-accent/20">
      <div
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          type === 'skill' ? 'bg-accent' : type === 'mcp-server' ? 'bg-violet-400' : 'bg-emerald-400'
        }`}
      />
      <div className="min-w-0 flex-1">
        <span className="text-[11px] font-bold text-text block truncate">
          {label}
        </span>
        {subtitle && (
          <span className="text-[9px] text-text-tertiary/50 block truncate font-mono">
            {subtitle}
          </span>
        )}
      </div>
      <button
        onClick={onRemove}
        className="w-5 h-5 flex items-center justify-center rounded-md text-text-tertiary/30 hover:text-red-400 hover:bg-red-500/10 transition-all duration-300 opacity-0 group-hover:opacity-100"
      >
        <X size={11} strokeWidth={2.5} />
      </button>
    </div>
  )
}
