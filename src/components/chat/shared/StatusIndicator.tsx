import { Loader2, CheckCircle, XCircle, Clock } from 'lucide-react'
import type { ToolState } from '../../../types'

interface StatusIndicatorProps {
  state: ToolState | 'streaming'
  size?: number
}

export function StatusIndicator({ state, size = 14 }: StatusIndicatorProps) {
  switch (state) {
    case 'pending':
      return <Clock size={size} className="text-[var(--color-warning)]" />
    case 'running':
      return <Loader2 size={size} className="text-[var(--color-primary)] animate-spin" />
    case 'completed':
      return <CheckCircle size={size} className="text-[var(--color-success)]" />
    case 'error':
      return <XCircle size={size} className="text-[var(--color-error)]" />
    case 'streaming':
      return <span className="shimmer-cursor" />
    default:
      return null
  }
}