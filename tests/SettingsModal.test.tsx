// Smoke render for the settings modal, focused on the split-out provider tab:
// the grid must render from the loaded provider list and a card click must
// open the detail view (Back control visible).

// @vitest-environment jsdom

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '../src/stores/appStore'
import { SettingsModal } from '../src/components/settings/SettingsModal'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => undefined) }))
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn(async () => undefined) }))
vi.mock('../src/utils/piClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/utils/piClient')>()
  return {
    ...actual,
    fetchProviders: vi.fn(async () => []),
  }
})

beforeEach(() => {
  // HeroUI ScrollShadow relies on ResizeObserver, absent in jsdom.
  if (!('ResizeObserver' in globalThis)) {
    // @ts-expect-error minimal stub
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  }
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true })
  useAppStore.setState({
    providerList: [
      { id: 'anthropic', name: 'Anthropic', env: 'ANTHROPIC_API_KEY', source: '' },
      { id: 'deepseek', name: 'DeepSeek', env: 'DEEPSEEK_API_KEY', source: '' },
    ],
    customProviders: [],
    providerConfigs: {},
    activeProvider: 'anthropic',
  })
})

describe('SettingsModal provider tab', () => {
  it('renders the provider detail, returns to the grid and opens another provider', () => {
    render(<SettingsModal onClose={() => {}} initialTab="provider" />)

    // The active provider is expanded on open.
    expect(screen.getByPlaceholderText('Paste your API key here...')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /back|返回/i }))

    // Grid shows the curated providers.
    expect(screen.getByText('DeepSeek')).toBeInTheDocument()
    fireEvent.click(screen.getByText('DeepSeek'))

    expect(screen.getByPlaceholderText('Paste your API key here...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /back|返回/i })).toBeInTheDocument()
  })

  it('does not fill a gateway for pi multi-protocol providers', async () => {
    useAppStore.setState({
      providerList: [
        { id: 'opencode-go', name: 'OpenCode Go', env: 'OPENCODE_API_KEY', source: 'https://opencode.ai/inference/go' },
      ],
      customProviders: [],
      providerConfigs: {},
      activeProvider: 'opencode-go',
    })

    render(<SettingsModal onClose={() => {}} initialTab="provider" />)

    const gateway = await screen.findByPlaceholderText('https://your-custom-proxy.com/v1')
    expect(gateway).toHaveValue('')

    const entry = useAppStore.getState().providerList.find((p) => p.id === 'opencode-go')
    expect(entry?.source).toBe('https://opencode.ai/inference/go')
    expect(entry?.env).toBe('OPENCODE_API_KEY')
  })

  it('still fills the gateway for providers outside the pi catalog', async () => {
    useAppStore.setState({
      providerList: [
        { id: 'ollama', name: 'Ollama (Local)', env: 'OLLAMA_API_KEY', source: 'http://localhost:11434/v1' },
      ],
      customProviders: [],
      providerConfigs: {},
      activeProvider: 'ollama',
    })

    render(<SettingsModal onClose={() => {}} initialTab="provider" />)

    const gateway = await screen.findByPlaceholderText('https://your-custom-proxy.com/v1')
    await waitFor(() => expect(gateway).toHaveValue('http://localhost:11434/v1'))
  })
})
