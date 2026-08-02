import type { ProviderConfig } from '../types'

type CredentialRecord = Record<string, unknown>
const credentialWriteQueues = new Map<string, Promise<void>>()

function canUseProtectedVault(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function providerCredentialName(providerId: string): string {
  return `provider:${providerId}`
}

export function webSearchCredentialName(providerId: string): string {
  return `websearch:${providerId}`
}

export function redactProviderConfigs(
  configs: Record<string, ProviderConfig>,
): Record<string, ProviderConfig> {
  return Object.fromEntries(
    Object.entries(configs).map(([id, config]) => [id, { ...config, apiKey: '' }]),
  )
}

export async function readProtectedCredential(name: string): Promise<CredentialRecord> {
  if (!canUseProtectedVault()) return {}
  const { invoke } = await import('@tauri-apps/api/core')
  return await invoke<CredentialRecord>('mcp_secret_get', { name })
}

export async function mergeProtectedCredential(
  name: string,
  values: CredentialRecord,
): Promise<void> {
  if (!canUseProtectedVault()) return
  const previous = credentialWriteQueues.get(name) || Promise.resolve()
  const operation = previous
    .catch(() => {})
    .then(async () => {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('mcp_secret_merge', { name, values })
    })
  credentialWriteQueues.set(name, operation)
  try {
    await operation
  } finally {
    if (credentialWriteQueues.get(name) === operation) {
      credentialWriteQueues.delete(name)
    }
  }
}

export async function saveProviderApiKey(providerId: string, apiKey: string): Promise<void> {
  await mergeProtectedCredential(providerCredentialName(providerId), {
    apiKey: apiKey || null,
  })
}

export async function loadProviderApiKey(providerId: string): Promise<string> {
  const credential = await readProtectedCredential(providerCredentialName(providerId))
  return typeof credential.apiKey === 'string' ? credential.apiKey : ''
}
