import type { ReactElement, ReactNode } from 'react'

export function SimpleSection({
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

export function MinimalStat({ label, value }: { label: string; value: string }) {
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

export function TagPanel({
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


export function SvgWrap({
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

export function CoreGlyph({ className }: { className?: string }) {
  return (
    <SvgWrap className={className}>
      <rect x="5.5" y="5.5" width="13" height="13" rx="4" stroke="currentColor" strokeWidth="1.8" />
      <rect x="9" y="9" width="6" height="6" rx="1.8" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.1 5.9 16 8M8 16 5.9 18.1M18.1 18.1 16 16M8 8 5.9 5.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </SvgWrap>
  )
}

export function MemoryGlyph({ className }: { className?: string }) {
  return (
    <SvgWrap className={className}>
      <path d="M7.5 6.3h7a3.2 3.2 0 0 1 3.2 3.2v6.1a2.8 2.8 0 0 1-2.8 2.8h-7a3.2 3.2 0 0 1-3.2-3.2V8.9a2.6 2.6 0 0 1 2.6-2.6Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 10h5.8M8.5 13h5.8M8.5 16h3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </SvgWrap>
  )
}

export function AssemblyGlyph({ className }: { className?: string }) {
  return (
    <SvgWrap className={className}>
      <rect x="4.8" y="6.2" width="5.2" height="5.2" rx="1.6" stroke="currentColor" strokeWidth="1.7" />
      <rect x="14" y="6.2" width="5.2" height="5.2" rx="1.6" stroke="currentColor" strokeWidth="1.7" />
      <rect x="9.4" y="14.2" width="5.2" height="5.2" rx="1.6" stroke="currentColor" strokeWidth="1.7" />
      <path d="M10 8.8h4M12 11.4v2.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </SvgWrap>
  )
}

