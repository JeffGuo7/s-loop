import type { PlatformId } from './platform'

export type ScheduleKind = 'once' | 'interval' | 'cron'
export type TaskDelivery = 'chat' | 'silent' | PlatformId

export interface TaskSchedule {
  kind: ScheduleKind
  /** For once: ISO timestamp to run at */
  runAt?: string
  /** For interval: every N minutes */
  minutes?: number
  /** For cron: standard 5-field cron expression */
  expr?: string
  /** Human-readable display string */
  display: string
}

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface RepeatConfig {
  /** Number of runs before auto-removal. null = infinite */
  times?: number
  /** Completed run count */
  completed: number
}

export interface ScheduledTask {
  id: string
  name: string
  prompt: string
  schedule: TaskSchedule

  /** Skill names to load before execution */
  skills: string[]
  /** Task IDs whose latest output is injected as context */
  contextFrom?: string[]
  /** Per-task model/provider overrides */
  model?: string
  provider?: string
  apiKey?: string
  workspaceDir?: string
  /** Deliver output to chat or a configured platform when done */
  deliver: TaskDelivery
  deliverSessionId?: string
  deliveredRunId?: string
  deliveryError?: string

  enabled: boolean
  repeat?: RepeatConfig

  nextRunAt: number | null
  lastRunAt: number | null
  lastStartedAt?: number | null
  lastFinishedAt?: number | null
  lastRunId?: string
  lastTrigger?: 'manual' | 'scheduled'
  lastStatus: TaskStatus
  lastError?: string
  createdAt: number
}

export interface TaskExecution {
  id: string
  taskId: string
  startTime: number
  endTime: number | null
  status: TaskStatus
  output: string
  error?: string
}

/**
 * Parse a schedule string into a TaskSchedule object.
 * Examples:
 *   "2026-06-08T09:00:00"  → once at time
 *   "every 30m"            → every 30 minutes
 *   "every 2h"             → every 2 hours
 *   "30m"                  → once in 30 minutes
 *   "0 9 * * *"           → daily at 9am (cron)
 */
export function parseSchedule(input: string): TaskSchedule {
  const s = input.trim()

  // "every X" → interval
  const everyMatch = s.match(/^every\s+(\d+)\s*(m|min|h|hr|d|day)s?$/i)
  if (everyMatch) {
    const val = parseInt(everyMatch[1])
    const unit = everyMatch[2].toLowerCase()[0]
    const minutes = unit === 'm' ? val : unit === 'h' ? val * 60 : val * 1440
    return { kind: 'interval', minutes, display: `every ${minutes}m` }
  }

  // Duration like "30m", "2h", "1d" → one-shot from now
  const durMatch = s.match(/^(\d+)\s*(m|min|h|hr|d|day)s?$/i)
  if (durMatch) {
    const val = parseInt(durMatch[1])
    const unit = durMatch[2].toLowerCase()[0]
    const minutes = unit === 'm' ? val : unit === 'h' ? val * 60 : val * 1440
    const runAt = new Date(Date.now() + minutes * 60_000).toISOString()
    return { kind: 'once', runAt, display: `once in ${s}` }
  }

  // ISO timestamp
  if (s.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s)
    if (!isNaN(d.getTime())) {
      return { kind: 'once', runAt: d.toISOString(), display: `once at ${d.toLocaleString()}` }
    }
  }

  // Attempt cron (5 space-separated fields)
  const parts = s.split(/\s+/)
  if (parts.length === 5 && parts.every(p => /^[\d\*\-,/]+$/.test(p))) {
    return { kind: 'cron', expr: s, display: s }
  }

  // Fallback: treat bare number as minutes
  if (/^\d+$/.test(s)) {
    const minutes = parseInt(s)
    const runAt = new Date(Date.now() + minutes * 60_000).toISOString()
    return { kind: 'once', runAt, display: `once in ${minutes}m` }
  }

  throw new Error(`Invalid schedule: "${s}". Use "every 30m", "0 9 * * *", or ISO timestamp.`)
}
