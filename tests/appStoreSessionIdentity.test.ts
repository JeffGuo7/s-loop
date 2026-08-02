// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAllSessions = vi.fn()
const updateSession = vi.fn(async () => undefined)
const deleteDbSession = vi.fn(async () => undefined)
const deletePiSession = vi.fn(async () => undefined)

vi.mock('../src/utils/database', () => ({
  getAllSessions,
  getMessages: vi.fn(async () => []),
  createSession: vi.fn(async () => undefined),
  updateSession,
  deleteSession: deleteDbSession,
  saveMessage: vi.fn(async () => undefined),
}))

vi.mock('../src/utils/piClient', () => ({
  deleteSession: deletePiSession,
}))

describe('app store session identity', () => {
  beforeEach(async () => {
    localStorage.clear()
    getAllSessions.mockReset()
    updateSession.mockClear()
    deleteDbSession.mockClear()
    deletePiSession.mockClear()

    const { useAppStore } = await import('../src/stores/appStore')
    useAppStore.setState({
      sessions: [],
      activeSessionId: null,
      sessionMessages: {},
      streamingMessage: {},
    })
  })

  it('restores piId from SQLite when the app reloads', async () => {
    getAllSessions.mockResolvedValueOnce([{
      id: 'ui-session',
      title: 'Existing chat',
      model: 'deepseek-chat',
      pi_id: 'pi-session',
      created_at: 1,
      updated_at: 2,
    }])
    const { useAppStore } = await import('../src/stores/appStore')

    await useAppStore.getState().loadFromDb()

    expect(useAppStore.getState().sessions[0].piId).toBe('pi-session')
  })

  it('updates the in-memory and SQLite pi session id together', async () => {
    const { useAppStore } = await import('../src/stores/appStore')
    useAppStore.setState({
      sessions: [{
        id: 'ui-session', title: 'Chat', model: '', createdAt: 1, updatedAt: 1,
      }],
    })

    useAppStore.getState().setSessionPiId('ui-session', 'pi-session')

    expect(useAppStore.getState().sessions[0].piId).toBe('pi-session')
    expect(updateSession).toHaveBeenCalledWith('ui-session', { pi_id: 'pi-session' })
  })

  it('deletes the backend session by piId instead of the UI id', async () => {
    const { useAppStore } = await import('../src/stores/appStore')
    useAppStore.setState({
      sessions: [{
        id: 'ui-session', piId: 'pi-session', title: 'Chat', model: '', createdAt: 1, updatedAt: 1,
      }],
    })

    useAppStore.getState().deleteSession('ui-session')
    await vi.waitFor(() => expect(deletePiSession).toHaveBeenCalled())

    expect(deleteDbSession).toHaveBeenCalledWith('ui-session')
    expect(deletePiSession).toHaveBeenCalledWith('pi-session')
    expect(deletePiSession).not.toHaveBeenCalledWith('ui-session')
  })
})
