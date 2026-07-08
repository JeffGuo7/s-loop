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
