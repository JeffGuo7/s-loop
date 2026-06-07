import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Pet, PetAnimationState, PetPackage } from '../types/pet'
import { DEFAULT_PET } from '../types/pet'

const IDLE_TIMEOUT = 30_000
const SLEEP_TIMEOUT = 120_000
const REACTION_MS = 1_500

function uid(): string { return Math.random().toString(36).slice(2, 11) }

let _idleT: ReturnType<typeof setTimeout> | null = null
let _sleepT: ReturnType<typeof setTimeout> | null = null
let _reactionT: ReturnType<typeof setTimeout> | null = null

function clearAll() {
  if (_idleT) { clearTimeout(_idleT); _idleT = null }
  if (_sleepT) { clearTimeout(_sleepT); _sleepT = null }
  if (_reactionT) { clearTimeout(_reactionT); _reactionT = null }
}

function startIdleChain(store: PetStore) {
  clearAll()
  _idleT = setTimeout(() => {
    store.setState('waiting')
    _sleepT = setTimeout(() => store.setState('sleeping'), SLEEP_TIMEOUT)
  }, IDLE_TIMEOUT)
}

interface PetStore {
  pet: Pet | null
  packages: PetPackage[]

  setState: (state: PetAnimationState) => void
  hatch: (name: string, personality?: string) => Pet
  dismiss: () => void
  interact: () => void
  // AI hooks
  onThinking: () => void
  onResponded: () => void
  onWorking: () => void
  onError: () => void
}

export const usePetStore = create<PetStore>()(
  persist(
    (set, get) => ({
      pet: null,
      packages: [DEFAULT_PET],

      setState: (state) => set(s => s.pet ? { pet: { ...s.pet, state } } : {}),

      hatch: (name, personality = 'Friendly') => {
        const now = Date.now()
        const p: Pet = {
          id: uid(), packageId: DEFAULT_PET.id, name, personality,
          state: 'idle', hatchedAt: now, lastInteraction: now,
        }
        set({ pet: p })
        startIdleChain(get())
        return p
      },

      dismiss: () => { clearAll(); set({ pet: null }) },

      interact: () => {
        const p = get().pet
        if (!p) return
        clearAll()
        set({ pet: { ...p, state: 'jumping', lastInteraction: Date.now() } })
        _reactionT = setTimeout(() => {
          const p2 = get().pet
          if (p2) { set({ pet: { ...p2, state: 'idle' } }); startIdleChain(get()) }
        }, REACTION_MS)
      },

      onThinking: () => { clearAll(); set(s => s.pet ? { pet: { ...s.pet, state: 'thinking' } } : {}) },
      onResponded: () => {
        const p = get().pet
        if (!p) return
        set({ pet: { ...p, state: 'idle' } })
        startIdleChain(get())
      },
      onWorking: () => { clearAll(); set(s => s.pet ? { pet: { ...s.pet, state: 'working' } } : {}) },
      onError: () => {
        clearAll()
        set(s => s.pet ? { pet: { ...s.pet, state: 'failed' } } : {})
        _reactionT = setTimeout(() => {
          const p2 = get().pet
          if (p2) { set({ pet: { ...p2, state: 'idle' } }); startIdleChain(get()) }
        }, REACTION_MS)
      },
    }),
    {
      name: 'snotra-pet',
      partialize: (s) => ({
        pet: s.pet ? { ...s.pet, state: 'idle' as const } : null,
      }),
    }
  )
)
