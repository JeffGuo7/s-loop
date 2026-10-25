// Smoke render for the Agent Studio panel. This is the regression net for the
// component split: the panel must still mount, show the agent list and open
// the detail view from the active agent's data.

// @vitest-environment jsdom

import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAgentStore } from '../src/stores/agentStore'
import { useAppStore } from '../src/stores/appStore'
import { useSkillStore } from '../src/stores/skillStore'
import { WorkspacePanel } from '../src/components/workspace/WorkspacePanel'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => undefined) }))
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn(async () => undefined) }))

beforeEach(() => {
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true })
  useAppStore.setState({
    workspaceDir: null,
    workspaceCollapsed: false,
    providerConfigs: {},
    activeProvider: 'anthropic',
  })
  useAgentStore.setState({
    agents: [{
      id: 'agent-1',
      name: 'Test Agent',
      description: 'Description',
      instructions: 'Be helpful',
      model: '',
      skills: [],
      mcpServers: [],
      mcpTools: [],
      mcpServerTools: [],
      workspaceRoots: [],
      permissionMode: 'ask',
      isDefault: true,
      createdAt: 0,
      updatedAt: 0,
    }],
    activeAgentId: 'agent-1',
    userProfile: { name: '', instructions: '' },
  })
  useSkillStore.setState({ skills: [], skillMeta: {} })
})

describe('WorkspacePanel', () => {
  it('renders the agent studio list with the active agent', () => {
    render(<WorkspacePanel />)
    expect(screen.getAllByText('Agent Studio').length).toBeGreaterThan(0)
    expect(screen.getByText('Test Agent')).toBeInTheDocument()
  })

  it('opens the detail view when the agent card is clicked', () => {
    render(<WorkspacePanel />)
    fireEvent.click(screen.getByText('Test Agent'))
    expect(screen.getAllByText(/Back|返回/i).length).toBeGreaterThan(0)
  })
})
