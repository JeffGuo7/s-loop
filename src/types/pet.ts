/**
 * Pet types — exact clawd-on-desk replica.
 */

// ─── Theme (from theme.json) ────────────────────────────

export interface PetThemeLayout {
  contentBox: { x: number; y: number; width: number; height: number }
  marginBox?: { x: number; y: number; width: number; height: number }
  centerX: number
  baselineY: number
  visibleHeightRatio: number
  baselineBottomRatio?: number
}

export interface PetThemeViewBox {
  x: number; y: number; width: number; height: number
}

export interface PetThemeEyeTracking {
  enabled: boolean
  states?: string[]
  eyeRatioX?: number
  eyeRatioY?: number
  maxOffset?: number
  bodyScale?: number
  shadowStretch?: number
  shadowShift?: number
  ids?: {
    eyes?: string
    body?: string
    shadow?: string
    dozeEyes?: string
  }
  shadowOrigin?: string
}

export interface PetThemeTimings {
  minDisplay?: Record<string, number>
  autoReturn?: Record<string, number>
  yawnDuration?: number
  collapseDuration?: number
  wakeDuration?: number
  deepSleepTimeout?: number
  mouseIdleTimeout?: number
  mouseSleepTimeout?: number
  dndSleepTransitionSvg?: string
  dndSleepTransitionDuration?: number
}

export interface PetThemeHitBox {
  x: number; y: number; w: number; h: number
}

export interface PetThemeReaction {
  file?: string
  files?: string[]
  duration?: number
}

export interface PetThemeMiniMode {
  supported: boolean
  offsetRatio?: number
  viewBox?: PetThemeViewBox
  states: Record<string, string[]>
  timings?: {
    minDisplay?: Record<string, number>
    autoReturn?: Record<string, number>
  }
  glyphFlips?: Record<string, number>
}

export interface PetThemeWorkingTier {
  minSessions: number
  file: string
}

export interface PetThemeIdleAnimation {
  file: string
  duration: number
}

export interface PetTheme {
  schemaVersion: number
  name: string
  author: string
  version: string
  description: string
  repo?: string
  viewBox: PetThemeViewBox
  fileViewBoxes?: Record<string, PetThemeViewBox>
  layout: PetThemeLayout
  trustedRuntime?: {
    scriptedSvgFiles?: string[]
    scriptedSvgCycleMs?: Record<string, number>
  }
  eyeTracking: PetThemeEyeTracking
  states: Record<string, string[]>
  sleepSequence?: { mode: 'full' | 'direct' }
  workingTiers?: PetThemeWorkingTier[]
  jugglingTiers?: PetThemeWorkingTier[]
  idleAnimations?: PetThemeIdleAnimation[]
  displayHintMap?: Record<string, string>
  updateVisuals?: Record<string, string>
  timings: PetThemeTimings
  hitBoxes: {
    default: PetThemeHitBox
    sleeping: PetThemeHitBox
    wide: PetThemeHitBox
  }
  fileHitBoxes?: Record<string, PetThemeHitBox>
  wideHitboxFiles?: string[]
  sleepingHitboxFiles?: string[]
  reactions: Record<string, PetThemeReaction>
  miniMode: PetThemeMiniMode
  sounds?: Record<string, string>
  objectScale: {
    widthRatio: number
    heightRatio: number
    imgWidthRatio?: number
    offsetX: number
    offsetY: number
    imgOffsetX?: number
    objBottom?: number
    imgBottom?: number
  }
}

// ─── Pet animation state (matches reference state machine) ──

export type PetAnimationState =
  | 'idle' | 'yawning' | 'dozing' | 'collapsing'
  | 'thinking' | 'working' | 'juggling' | 'building'
  | 'attention' | 'notification' | 'error'
  | 'sweeping' | 'carrying' | 'sleeping' | 'waking'
  | 'mini-idle' | 'mini-alert' | 'mini-happy'
  | 'mini-enter' | 'mini-peek' | 'mini-working'
  | 'mini-crabwalk' | 'mini-enter-sleep' | 'mini-sleep'

export type PetMood = 'happy' | 'neutral' | 'sleepy' | 'excited'

// ─── Pet package ───────────────────────────────────────

export interface PetPackage {
  id: string
  displayName: string
  description: string
  version: string
  author?: string
  assetsPath: string
  theme: PetTheme
}

// ─── Pet instance ──────────────────────────────────────

export interface Pet {
  id: string
  packageId: string
  name: string
  personality: string
  state: PetAnimationState
  mood: PetMood
  hatchedAt: number
  lastInteraction: number
  level?: number
  xp?: number
  idleAnimationFile?: string | null
}

// ─── Pet position ──────────────────────────────────────

export interface PetPosition {
  x: number
  y: number
}
