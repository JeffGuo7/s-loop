import type { ProviderConfig } from '../types'

// OpenCode's gateway differs per API family, so the bundled pi catalog is the
// only correct source. Older builds auto-filled a single URL for these two
// providers; clear those saved values so pi can pick the right one per model.
const LEGACY_OPENCODE_GATEWAYS: Record<string, string[]> = {
  opencode: ['https://api.opencode.ai/v1'],
  'opencode-go': ['https://opencode.ai/zen/go/v1'],
}

export function clearLegacyOpenCodeGateways(
  configs: Record<string, ProviderConfig>,
): Record<string, ProviderConfig> {
  let changed = false
  const next = { ...configs }
  for (const [id, legacyUrls] of Object.entries(LEGACY_OPENCODE_GATEWAYS)) {
    const config = next[id]
    if (config?.baseUrl && legacyUrls.includes(config.baseUrl)) {
      next[id] = { ...config, baseUrl: '' }
      changed = true
    }
  }
  return changed ? next : configs
}
