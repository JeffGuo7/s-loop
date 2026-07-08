import type { PetPackage, PetTheme, PetAnimationState } from '../types/pet'

const PET_PACKAGES: PetPackage[] = []
const PET_IDS = ['clawd']

let loaded = false

export async function loadPetPackages(): Promise<PetPackage[]> {
  if (loaded && PET_PACKAGES.length > 0) return PET_PACKAGES
  loaded = true

  for (const id of PET_IDS) {
    try {
      const themeRes = await fetch(`/pets/${id}/theme.json`)
      if (themeRes.ok) {
        const theme: PetTheme = await themeRes.json()
        PET_PACKAGES.push({
          id,
          displayName: theme.name,
          description: theme.description,
          version: theme.version,
          author: theme.author,
          assetsPath: `/pets/${id}/assets`,
          theme,
        })
      }
    } catch {
      // package not available
    }
  }

  return PET_PACKAGES
}

export function getThemeSvg(theme: PetTheme, state: PetAnimationState): string | null {
  const files = theme.states[state]
  if (files && files.length > 0) return files[0]
  return null
}

export function getSvgPath(pkg: PetPackage, state: PetAnimationState): string | null {
  const file = getThemeSvg(pkg.theme, state)
  if (!file) return null
  return `${pkg.assetsPath}/${file}`
}

export function getReactionSvg(pkg: PetPackage, reaction: string): string | null {
  const r = pkg.theme.reactions[reaction]
  if (!r) return null
  const file = r.file || (r.files?.[0])
  if (!file) return null
  return `${pkg.assetsPath}/${file}`
}

export function getAllPackages(): PetPackage[] {
  return PET_PACKAGES
}

export function getPackageById(id: string): PetPackage | undefined {
  return PET_PACKAGES.find(p => p.id === id)
}

// ─── Idle animations ──────────────────────────────────────
// Pick a random idle animation from the theme's idleAnimations list.
// Returns { stateName, file, duration } or null if none configured.

let _lastIdleAnimIdx = -1

export function getIdleAnimation(theme: PetTheme): { stateName: string; file: string; duration: number } | null {
  const anims = theme.idleAnimations
  if (!anims || anims.length === 0) return null

  // Avoid repeating the same animation
  let idx = Math.floor(Math.random() * anims.length)
  if (anims.length > 1 && idx === _lastIdleAnimIdx) {
    idx = (idx + 1) % anims.length
  }
  _lastIdleAnimIdx = idx

  const anim = anims[idx]
  // Derive state name from filename: clawd-idle-look.svg → idle-look
  const stateName = anim.file.replace(/^clawd-/, '').replace(/\.svg$/, '')
  return { stateName, file: anim.file, duration: anim.duration }
}

// ─── Working tiers ────────────────────────────────────────
// Pick a working animation based on active session count.
// Falls back to the base 'working' state SVG.

export function getWorkingTierSvg(theme: PetTheme, activeSessions: number): string | null {
  const tiers = theme.workingTiers
  if (!tiers || tiers.length === 0) return getThemeSvg(theme, 'working')

  // Sort by minSessions descending, pick the first tier where count >= minSessions
  const sorted = [...tiers].sort((a, b) => b.minSessions - a.minSessions)
  for (const tier of sorted) {
    if (activeSessions >= tier.minSessions) return tier.file
  }
  return getThemeSvg(theme, 'working')
}

// ─── Mini mode ────────────────────────────────────────────

export function getMiniSvg(theme: PetTheme, fullState: PetAnimationState): string | null {
  if (!theme.miniMode?.supported) return null
  // Map full-size states to mini states
  const miniStateMap: Record<string, string> = {
    idle: 'mini-idle',
    attention: 'mini-alert',
    thinking: 'mini-working',
    working: 'mini-working',
    juggling: 'mini-working',
    building: 'mini-working',
    notification: 'mini-alert',
    sleeping: 'mini-sleep',
    error: 'mini-alert',
  }
  const miniState = miniStateMap[fullState] || 'mini-idle'
  const files = theme.miniMode.states[miniState]
  if (files && files.length > 0) return files[0]
  return null
}

export function getMiniSvgPath(pkg: PetPackage, fullState: PetAnimationState): string | null {
  const file = getMiniSvg(pkg.theme, fullState)
  if (!file) return null
  return `${pkg.assetsPath}/${file}`
}
