import { useState, useEffect, useRef } from 'react'

interface StreamingIndicatorProps {
  verb?: string
  elapsedSeconds?: number
  tokenCount?: number
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

export function StreamingIndicator({
  verb = 'Working',
  elapsedSeconds = 0,
  tokenCount,
}: StreamingIndicatorProps) {
  const [elapsed, setElapsed] = useState(elapsedSeconds)
  const startTimeRef = useRef(Date.now())

  useEffect(() => {
    startTimeRef.current = Date.now()
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex justify-center py-2">
      <div className="inline-flex items-center gap-2 rounded-full border border-(--color-border)/50 bg-(--color-surface-secondary) px-3 py-1 text-xs text-(--color-text-secondary)">
        <span className="animate-shimmer text-(--color-accent)">✦</span>
        <span>{verb}...</span>
        <span className="text-(--color-text-tertiary)">{formatElapsed(elapsed)}</span>
        {tokenCount !== undefined && tokenCount > 0 && (
          <span className="text-(--color-text-tertiary)">{tokenCount} tokens</span>
        )}
      </div>
    </div>
  )
}