import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { syncAgentProfileFiles } from '../src/utils/agentProfileFiles'

describe('agent profile file sync', () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset()
    vi.mocked(invoke).mockResolvedValue(undefined)
  })

  it('writes the named soul files and shared user profile through Tauri', async () => {
    await syncAgentProfileFiles(
      [{
        id: 'agent_one',
        name: 'One',
        description: '',
        identity: 'identity',
        soul: 'soul',
        rules: 'rules',
        memory: 'memory',
        conversationMode: 'natural',
      }],
      'user profile',
      47,
    )

    expect(vi.mocked(invoke)).toHaveBeenCalledWith('save_agent_profile_files', {
      profile: expect.objectContaining({
        agentId: 'agent_one',
        identity: 'identity',
        soul: 'soul',
        rules: 'rules',
        memory: 'memory',
        userProfile: 'user profile',
        speakerId: 47,
        conversationMode: 'natural',
      }),
    })
  })
})
