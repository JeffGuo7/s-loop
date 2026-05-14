import { Loader2, CheckCircle, XCircle, Clock } from 'lucide-react'
import type { ToolState } from '../../../types'

interface StatusIndicatorProps {
  state: ToolState | 'streaming'
  size?: number
}

export function StatusIndicator({ state, size = 14 }: StatusIndicatorProps) {
  switch (state) {
    case 'pending':
      return <Clock size={size} className="text-yellow-500" />
    case 'running':
      return <Loader2 size={size} className="text-blue-500 animate-spin" />
    case 'completed':
      return <CheckCircle size={size} className="text-green-500" />
    case 'error':
      return <XCircle size={size} className="text-red-500" />
    case 'streaming':
      return <span className="inline-block w-2 h-4 bg-[var(--color-primary)] animate-pulse" />
    default:
      return null
  }
}