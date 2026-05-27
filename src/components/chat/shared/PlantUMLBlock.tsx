import { useMemo, useState } from 'react'
import { AlertCircle } from 'lucide-react'

// Simple PlantUML encoder (re-implementing the relevant part of plantuml-encoder)
function encodePlantUML(source: string): string {
  // Deflate + base64 encoding (standard PlantUML server format)
  // For simplicity, use the raw format which the server also accepts
  return btoa(unescape(encodeURIComponent(source)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

interface PlantUMLBlockProps {
  code: string
}

export function PlantUMLBlock({ code }: PlantUMLBlockProps) {
  const [error, setError] = useState(false)

  const imageUrl = useMemo(() => {
    try {
      const encoded = encodePlantUML(code)
      return `https://www.plantuml.com/plantuml/svg/${encoded}`
    } catch {
      setError(true)
      return ''
    }
  }, [code])

  if (error) {
    return (
      <div className="my-3 p-4 rounded-xl bg-[var(--color-error)]/5 border border-[var(--color-error)]/20">
        <p className="text-xs font-bold text-[var(--color-error)] flex items-center gap-1">
          <AlertCircle size={12} /> Failed to render PlantUML
        </p>
        <pre className="mt-2 text-[11px] text-[var(--color-text-tertiary)] font-mono">{code}</pre>
      </div>
    )
  }

  return (
    <div className="my-3 p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] overflow-x-auto">
      <img
        src={imageUrl}
        alt="PlantUML Diagram"
        className="max-w-full h-auto"
        onError={() => setError(true)}
      />
    </div>
  )
}
