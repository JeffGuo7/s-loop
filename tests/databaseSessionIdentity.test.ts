import { beforeEach, describe, expect, it, vi } from 'vitest'

const execute = vi.fn()
const select = vi.fn()
const load = vi.fn(async () => ({ execute, select }))

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: { load },
}))

describe('database session identity', () => {
  beforeEach(() => {
    execute.mockReset()
    select.mockReset()
    load.mockClear()
  })

  it('migrates existing session tables with a durable pi_id column', async () => {
    select.mockResolvedValueOnce([
      { name: 'id' },
      { name: 'title' },
      { name: 'model' },
      { name: 'created_at' },
      { name: 'updated_at' },
    ])

    const database = await import('../src/utils/database')
    await database.initDatabase()

    expect(execute).toHaveBeenCalledWith('ALTER TABLE sessions ADD COLUMN pi_id TEXT')
  })

  it('persists and updates the backend pi session id', async () => {
    const database = await import('../src/utils/database')

    await database.createSession('ui-session', 'Chat', 'deepseek-chat', 'pi-session')
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('pi_id'),
      ['ui-session', 'Chat', 'deepseek-chat', 'pi-session', expect.any(Number), expect.any(Number)],
    )

    execute.mockClear()
    await database.updateSession('ui-session', { pi_id: 'pi-session-2' })
    expect(execute).toHaveBeenCalledWith(
      expect.stringContaining('pi_id = ?'),
      ['pi-session-2', expect.any(Number), 'ui-session'],
    )
  })
})
