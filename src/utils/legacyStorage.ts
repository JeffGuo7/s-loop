// One-time migration of localStorage keys from the legacy "snotra-" prefix
// to the "s-loop-" brand. Runs at module load and must be imported BEFORE
// any zustand store module evaluates (stores read these keys at create()).
//
// Old values are copied, not removed, so an older app build on the same
// machine keeps working.

const LEGACY_KEYS: Array<[oldKey: string, newKey: string]> = [
  ['snotra-storage', 's-loop-storage'],
  ['snotra-agents', 's-loop-agents'],
  ['snotra-skill-storage', 's-loop-skill-storage'],
  ['snotra-mcp-storage', 's-loop-mcp-storage'],
  ['snotra-websearch-storage', 's-loop-websearch-storage'],
  ['snotra-pet', 's-loop-pet'],
  ['snotra-locale', 's-loop-locale'],
]

export function migrateLegacyStorageKeys(storage: Storage = window.localStorage): void {
  for (const [oldKey, newKey] of LEGACY_KEYS) {
    try {
      if (storage.getItem(oldKey) !== null && storage.getItem(newKey) === null) {
        storage.setItem(newKey, storage.getItem(oldKey) as string)
      }
    } catch {
      // Storage unavailable (private mode, denied quota) — skip silently.
    }
  }
}

migrateLegacyStorageKeys()
