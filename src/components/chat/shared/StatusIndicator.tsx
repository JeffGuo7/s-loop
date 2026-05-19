import { Loader2, CheckCircle, XCircle, Clock } from 'lucide-react'
import type { ToolState } from '../../../types'

interface StatusIndicatorProps {
  state: ToolState
  size?: number
}

export function StatusIndicator({ state, size = 14 }: StatusIndicatorProps) {
  const status = state.status

  switch (status) {
    case 'pending':
      return <Clock size={size} className="text-[var(--color-warning)]" />
    case 'running':
      return <Loader2 size={size} className="text-[var(--color-accent)] animate-spin" />
    case 'completed':
      return <CheckCircle size={size} className="text-[var(--color-success)]" />
    case 'error':
      return <XCircle size={size} className="text-[var(--color-error)]" />
    default:
      return null
  }
}