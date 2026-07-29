import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('pi-server fetch authentication', () => {
  it('adds the launch token only to the configured local sidecar origin', async () => {
    const nativeFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('window', {
      fetch: nativeFetch,
      location: { href: 'http://localhost:1420/' },
    })

    const {
      installPiServerFetchInterceptor,
      setServerConnection,
    } = await import('../src/utils/piClient')

    installPiServerFetchInterceptor()
    setServerConnection('http://127.0.0.1:4101', 'launch-secret')

    await window.fetch('http://127.0.0.1:4101/tasks', {
      headers: { 'Content-Type': 'application/json' },
    })
    await window.fetch('https://api.telegram.org/bot123/sendMessage')

    const localInit = nativeFetch.mock.calls[0][1] as RequestInit
    const localHeaders = new Headers(localInit.headers)
    expect(localHeaders.get('X-Snotra-Token')).toBe('launch-secret')
    expect(localHeaders.get('Content-Type')).toBe('application/json')

    const externalInit = nativeFetch.mock.calls[1][1] as RequestInit | undefined
    expect(externalInit?.headers).toBeUndefined()
  })
})
