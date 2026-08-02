import type { PlatformConfig } from '../types/platform'

export interface PlatformValueSplit {
  publicValues: Record<string, string>
  secrets: Record<string, string>
}

export function platformCredentialName(platformId: string): string {
  return `platform:${platformId}`
}

export function getPlatformSecretKeys(platform: PlatformConfig): Set<string> {
  return new Set(platform.fields
    .filter((field) => (
      field.type === 'password'
      || field.key === 'webhookUrl'
      || (platform.id === 'webhook' && field.key === 'url')
    ))
    .map((field) => field.key))
}

export function splitPlatformValues(
  platform: PlatformConfig,
  values: Record<string, string>,
): PlatformValueSplit {
  const secretKeys = getPlatformSecretKeys(platform)
  const publicValues: Record<string, string> = {}
  const secrets: Record<string, string> = {}
  for (const [key, value] of Object.entries(values)) {
    if (secretKeys.has(key)) secrets[key] = value
    else publicValues[key] = value
  }
  return { publicValues, secrets }
}
