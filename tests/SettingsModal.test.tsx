// Smoke render for the settings modal, focused on the split-out provider tab:
// the grid must render from the loaded provider list and a card click must
// open the detail view (Back control visible).

// @vitest-environment jsdom

import { render, screen, fireEvent } from '@testing-library/react'
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
})
