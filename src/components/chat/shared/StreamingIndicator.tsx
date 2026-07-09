import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

interface StreamingIndicatorProps {
  verb?: string
  elapsedSeconds?: number
  tokenCount?: number
}

function formatElapsed(seconds: number, t: TFunction): string {
  if (seconds < 60) return t('chat.streaming.seconds', { n: seconds })
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return t('chat.streaming.minutesSeconds', { n: m, n2: s })
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
    <div className="flex items-center gap-2 mt-2 text-[11px] text-text-tertiary transition-opacity duration-500">
      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
      <span className="font-medium">{verb}…</span>
      <span className="text-text-quaternary tabular-nums">{formatElapsed(elapsed, t)}</span>
      {tokenCount !== undefined && tokenCount > 0 && (
        <span className="text-text-quaternary">{t('chat.parts.tokens', { count: tokenCount })}</span>
      )}
    </div>
  )
}
