import { useEffect, useRef, useState } from 'react'

interface MermaidBlockProps {
  code: string
}

export function MermaidBlock({ code }: MermaidBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [rendered, setRendered] = useState(false)

  useEffect(() => {
    let cancelled = false
    const render = async () => {
      try {
        const mermaid = (await import('mermaid')).default
        await mermaid.initialize({
          theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default',
          startOnLoad: false,
        })

        if (cancelled || !containerRef.current) return

        const { svg } = await mermaid.render('mermaid-' + Date.now(), code)
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg
          setRendered(true)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render mermaid diagram')
          setRendered(false)
        }
      }
    }
    render()
    return () => { cancelled = true }
  }, [code])

  if (error) {
    return (
      <div className="my-3 p-4 rounded-xl bg-[var(--color-error)]/5 border border-[var(--color-error)]/20">
        <p className="text-xs font-bold text-[var(--color-error)] mb-1">Mermaid render error</p>
        <pre className="text-[11px] text-[var(--color-error)]/80 font-mono whitespace-pre-wrap">{error}</pre>
        <pre className="mt-2 text-[11px] text-[var(--color-text-tertiary)] font-mono">{code}</pre>
      </div>
    )
  }

  return (
    <div className="my-3 p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-x-auto">
      <div ref={containerRef} className="mermaid-wrapper flex justify-center [&_svg]:max-w-full" />
      {!rendered && (
        <div className="text-center py-8">
          <div className="w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-[var(--color-text-tertiary)] mt-2">Rendering diagram...</p>
        </div>
      )}
    </div>
  )
}
