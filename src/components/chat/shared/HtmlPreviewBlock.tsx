import { useMemo } from 'react'

interface HtmlPreviewBlockProps {
  code: string
}

export function HtmlPreviewBlock({ code }: HtmlPreviewBlockProps) {
  const srcDoc = useMemo(() => {
    if (code.trim().toLowerCase().startsWith('<!doctype') || code.trim().toLowerCase().startsWith('<html')) {
      return code
    }
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:16px;font-family:system-ui,sans-serif}</style></head><body>${code}</body></html>`
  }, [code])

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-[var(--color-border)]">
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--color-surface-secondary)] border-b border-[var(--color-border)]">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">
          Live Preview
        </span>
      </div>
      <iframe
        srcDoc={srcDoc}
        sandbox="allow-scripts"
        className="w-full bg-white"
        style={{ minHeight: 200, height: 'auto' }}
        title="HTML Preview"
      />
    </div>
  )
}
