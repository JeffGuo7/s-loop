import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

interface StreamingIndicatorProps {
  verb?: string
  elapsedSeconds?: number
  tokenCount?: number
}

function formatElapsed(seconds: number, t: TFunction): string {
  if (seconds < 60) return t('chat.parts.seconds', { n: seconds })
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return t('chat.parts.minutesSeconds', { m, s })
}

export function StreamingIndicator({
  verb = 'Working',
  elapsedSeconds = 0,
  tokenCount,
}: StreamingIndicatorProps) {
  const { t } = useTranslation()
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
    <div className="flex justify-center py-3">
      <div className="inline-flex items-center gap-3 rounded-full border border-border/50 bg-surface-secondary px-5 py-2 text-[13px] font-bold tracking-tight text-text-secondary shadow-sm">
        <span className="animate-shimmer text-accent">✦</span>
        <span>{verb}...</span>
        <span className="text-text-tertiary opacity-60 ml-1">{formatElapsed(elapsed, t)}</span>
        {tokenCount !== undefined && tokenCount > 0 && (
          <span className="text-text-tertiary opacity-60 ml-1">{t('chat.parts.tokens', { count: tokenCount })}</span>
        )}
      </div>
    </div>
  )
}
