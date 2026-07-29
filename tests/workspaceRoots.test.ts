import { describe, expect, it } from 'vitest'
import {
  createWorkspaceRoot,
  migrateAgentStoreState,
  migrateAgentWorkspaceRoots,
} from '../src/utils/workspaceRoots'

describe('workspace root migration', () => {
  it('migrates legacy accessible paths as read-write grants', () => {
    const migrated = migrateAgentWorkspaceRoots({
      id: 'legacy',
      accessiblePaths: ['C:\\shared', 'D:\\reports'],
    })

    expect(migrated.workspaceRoots).toEqual([
      expect.objectContaining({
        path: 'C:\\shared',
        access: 'read-write',
        primary: false,
        source: 'user-grant',
      }),
      expect.objectContaining({
        path: 'D:\\reports',
        access: 'read-write',
        primary: false,
        source: 'user-grant',
      }),
    ])
    expect('accessiblePaths' in migrated).toBe(false)
  })

  it('keeps valid new grants and defaults malformed access to read-only', () => {
    const migrated = migrateAgentWorkspaceRoots({
      id: 'current',
      workspaceRoots: [
        createWorkspaceRoot('C:\\readonly'),
        { path: 'D:\\unknown', access: 'admin' },
      ],
    })

    expect(migrated.workspaceRoots.map((root) => root.access)).toEqual(['read', 'read'])
  })

  it('migrates every agent in persisted state without changing other state', () => {
    const migrated = migrateAgentStoreState({
      activeAgentId: 'one',
      agents: [{ id: 'one', accessiblePaths: ['/shared'], permissionMode: 'allow' }],
      futureField: true,
    }) as {
      activeAgentId: string
      agents: Array<{
        workspaceRoots: Array<{ path: string; access: string }>
        permissionMode: string
      }>
      futureField: boolean
    }

    expect(migrated.activeAgentId).toBe('one')
    expect(migrated.futureField).toBe(true)
    expect(migrated.agents[0].workspaceRoots[0]).toMatchObject({
      path: '/shared',
      access: 'read-write',
    })
    expect(migrated.agents[0].permissionMode).toBe('allow')
  })
})
