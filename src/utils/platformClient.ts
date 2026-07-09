import { getBaseUrl } from './piClient'
import { jsonRequest } from './http'
import type { PlatformId, PlatformSnapshot } from '../types/platform'

const BASE = () => getBaseUrl()

async function request(path: string, init?: RequestInit): Promise<PlatformSnapshot> {
  const res = await fetch(`${BASE()}${path}`, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`)
  }
  return data as PlatformSnapshot
}

export function loadPlatformSnapshot() {
  return request('/platforms')
}

export function savePlatformConfig(id: PlatformId, values: Record<string, string>) {
  return request(`/platforms/${id}/config`, jsonRequest({ values }))
}

export function connectPlatform(id: PlatformId, values: Record<string, string>) {
  return request(`/platforms/${id}/connect`, jsonRequest({ values }))
}

export function disconnectPlatform(id: PlatformId) {
  return request(`/platforms/${id}/disconnect`, {
    method: 'POST',
  })
}

export function sendPlatformMessage(id: PlatformId, text: string) {
  return request(`/platforms/${id}/send`, jsonRequest({ text }))
}

export function testPlatformMessage(id: PlatformId, text?: string) {
  return request(`/platforms/${id}/test`, jsonRequest({ text }))
}

export function clearPlatformMessages() {
  return request('/platforms/messages', {
    method: 'DELETE',
  })
}
