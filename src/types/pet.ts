/**
 * Pet types — exact clawd-on-desk replica.
 * Matches codex-pet-adapter.js: ATLAS, ATLAS_ROWS, pet.json, theme.json
 */

// ─── Atlas ──────────────────────────────────────────────

export interface Atlas {
  width: number
  height: number
  columns: number
  rows: number
  frameWidth: number
  frameHeight: number
}

export const ATLAS: Atlas = {
  width: 1536, height: 1872,
  columns: 8, rows: 9,
  frameWidth: 192, frameHeight: 208,
}

// ─── Animation rows (exact clawd replica) ───────────────

export type AnimationRowKey =
  | 'idle' | 'running-right' | 'running-left'
  | 'waving' | 'jumping' | 'failed'
  | 'waiting' | 'running' | 'review'

export interface AnimationRow {
  key: AnimationRowKey
  row: number
  durations: number[]
}

/** Exact clawd ATLAS_ROWS */
export const ATLAS_ROWS: AnimationRow[] = [
  { key: 'idle',          row: 0, durations: [280, 110, 110, 140, 140, 320] },
  { key: 'running-right', row: 1, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  { key: 'running-left',  row: 2, durations: [120, 120, 120, 120, 120, 120, 120, 220] },
  { key: 'waving',        row: 3, durations: [140, 140, 140, 280] },
  { key: 'jumping',       row: 4, durations: [140, 140, 140, 140, 280] },
  { key: 'failed',        row: 5, durations: [140, 140, 140, 140, 140, 140, 140, 240] },
  { key: 'waiting',       row: 6, durations: [150, 150, 150, 150, 150, 260] },
  { key: 'running',       row: 7, durations: [120, 120, 120, 120, 120, 220] },
  { key: 'review',        row: 8, durations: [150, 150, 150, 150, 150, 280] },
]

export const ROW_BY_KEY = new Map<string, AnimationRow>(ATLAS_ROWS.map(r => [r.key, r]))

export function rowTotalMs(row: AnimationRow): number {
  return row.durations.reduce((a, b) => a + b, 0)
}

// ─── Pet state (matches clawd theme.json states) ────────

export type PetAnimationState =
  | 'idle' | 'thinking' | 'working' | 'failed'
  | 'waiting' | 'jumping' | 'waving' | 'sleeping'

/** Maps pet animation state → atlas row key */
export const STATE_ROW: Record<PetAnimationState, AnimationRowKey> = {
  idle:     'idle',
  thinking: 'review',
  working:  'running',
  failed:   'failed',
  waiting:  'waiting',
  jumping:  'jumping',
  waving:   'waving',
  sleeping: 'idle',
}

// ─── Pet package (clawd pet.json) ───────────────────────

export interface PetPackage {
  id: string
  displayName: string
  description: string
  version: string
  author?: string
  spritesheetPath: string
  atlas?: Atlas
  rows?: { key: AnimationRowKey; durations?: number[] }[]
}

// ─── Pet instance ──────────────────────────────────────

export interface Pet {
  id: string
  packageId: string
  name: string
  personality: string
  state: PetAnimationState
  hatchedAt: number
  lastInteraction: number
}

// ─── Default pet package ───────────────────────────────

export const DEFAULT_PET: PetPackage = {
  id: 'cloudling',
  displayName: 'Cloudling',
  description: 'A friendly cloud spirit companion',
  version: '1.0.0',
  spritesheetPath: '/pets/default/spritesheet.png',
  atlas: ATLAS,
}

// ─── CSS keyframes generator ───────────────────────────

export function rowStylesheet(prefix: string, atlas: Atlas = ATLAS): string {
  return ATLAS_ROWS.map(row => {
    const total = row.durations.reduce((a, b) => a + b, 0)
    let elapsed = 0
    const stops = row.durations.map((dur, col) => {
      const pct = ((elapsed / total) * 100).toFixed(4)
      elapsed += dur
      return `  ${pct}% { background-position: -${col * atlas.frameWidth}px -${row.row * atlas.frameHeight}px; }`
    })
    stops.push(`  100% { background-position: -${(row.durations.length - 1) * atlas.frameWidth}px -${row.row * atlas.frameHeight}px; }`)
    return `@keyframes ${prefix}-${row.key} {\n${stops.join('\n')}\n}`
  }).join('\n\n')
}

export function animationConfig(rowKey: AnimationRowKey, mode: 'loop' | 'once'): {
  name: string
  durationMs: number
  iterationCount: string | number
  prefix: string
} {
  const row = ROW_BY_KEY.get(rowKey) ?? ATLAS_ROWS[0]
  return {
    name: `pet-${rowKey}`,
    durationMs: rowTotalMs(row),
    iterationCount: mode === 'once' ? 1 : 'infinite',
    prefix: 'pet',
  }
}
