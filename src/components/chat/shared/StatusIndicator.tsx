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
      return <Clock size={size} className="text-(--color-warning)" />
    case 'running':
      return <Loader2 size={size} className="text-(--color-accent) animate-spin" />
    case 'completed':
      return <CheckCircle size={size} className="text-(--color-success)" />
    case 'error':
      return <XCircle size={size} className="text-(--color-error)" />
    default:
      return null
  }
}