import { describe, it, expect } from 'vitest'
import en from '../src/i18n/locales/en'
import zh from '../src/i18n/locales/zh'

/** Recursively collect all leaf keys from a nested object */
function flattenKeys(obj: Record<string, any>, prefix = ''): string[] {
  const keys: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...flattenKeys(v, path))
    } else {
      keys.push(path)
    }
  }
  return keys
}

describe('i18n keys', () => {
  it('en and zh have the same translation keys', () => {
    const enKeys = flattenKeys(en)
    const zhKeys = flattenKeys(zh)

    const missingInZh = enKeys.filter(k => !zhKeys.includes(k))
    const missingInEn = zhKeys.filter(k => !enKeys.includes(k))

    expect(missingInZh, `Keys missing in zh: [${missingInZh.join(', ')}]`).toEqual([])
    expect(missingInEn, `Keys missing in en: [${missingInEn.join(', ')}]`).toEqual([])
  })

  it('en translations are non-empty strings', () => {
    const keys = flattenKeys(en)
    for (const key of keys) {
      const value = key.split('.').reduce((o: any, k: string) => o?.[k], en)
      expect(typeof value).toBe('string')
      expect(value.length).toBeGreaterThan(0)
    }
  })

  it('zh translations are non-empty strings', () => {
    const keys = flattenKeys(zh)
    for (const key of keys) {
      const value = key.split('.').reduce((o: any, k: string) => o?.[k], zh)
      expect(typeof value).toBe('string')
      expect(value.length).toBeGreaterThan(0)
    }
  })
})
