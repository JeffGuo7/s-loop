import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Pet, PetAnimationState, PetPackage, PetMood, PetPosition } from '../types/pet'
import { loadPetPackages } from '../utils/petTheme'

const IDLE_TIMEOUT = 20_000
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
    store.setState('attention')
    _sleepT = setTimeout(() => store.setState('sleeping'), SLEEP_TIMEOUT)
  }, IDLE_TIMEOUT)
}

function emitPetEvent(state: PetAnimationState, mood: PetMood) {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    import('@tauri-apps/api/event').then(({ emit }) => {
      emit('pet-state', { state, mood }).catch(() => {})
    }).catch(() => {})
  }
}

interface PetStore {
  pet: Pet | null
  packages: PetPackage[]
  showPet: boolean
  petWindowVisible: boolean
  petPosition: PetPosition
  packagesLoaded: boolean

  setState: (state: PetAnimationState) => void
  setMood: (mood: PetMood) => void
  setShowPet: (show: boolean) => void
  setPetWindowVisible: (visible: boolean) => void
  setPetPosition: (pos: PetPosition) => void

  loadPackages: () => Promise<void>
  hatch: (name: string, personality?: string, packageId?: string) => Pet
  dismiss: () => void
  interact: () => void

  onThinking: () => void
  onResponded: () => void
  onWorking: () => void
  onError: () => void
  onNotification: () => void
}

export const usePetStore = create<PetStore>()(
  persist(
    (set, get) => ({
      pet: null,
      packages: [],
      showPet: false,
      petWindowVisible: false,
      petPosition: { x: 100, y: 100 },
      packagesLoaded: false,

      setState: (state) => set(s => {
        if (!s.pet) return {}
        emitPetEvent(state, s.pet.mood)
        return { pet: { ...s.pet, state } }
      }),
      setMood: (mood) => set(s => s.pet ? { pet: { ...s.pet, mood } } : {}),
      setShowPet: (show) => set({ showPet: show }),
      setPetWindowVisible: (visible) => set({ petWindowVisible: visible }),
      setPetPosition: (pos) => set({ petPosition: pos }),

      loadPackages: async () => {
        if (get().packagesLoaded) return
        const pkgs = await loadPetPackages()
        set({ packages: pkgs, packagesLoaded: true })
      },

      hatch: (name, personality = 'Friendly', packageId = 'cloudling') => {
        const now = Date.now()
        const p: Pet = {
          id: uid(),
          packageId,
          name,
          personality,
          state: 'idle',
          mood: 'excited',
          hatchedAt: now,
          lastInteraction: now,
        }
        set({ pet: p, showPet: true })
        startIdleChain(get())
        return p
      },

      dismiss: () => { clearAll(); set({ pet: null, showPet: false }) },

      interact: () => {
        const p = get().pet
        if (!p) return
        clearAll()
        set({ pet: { ...p, state: 'attention', lastInteraction: Date.now(), mood: 'happy' } })
        emitPetEvent('attention', 'happy')
        _reactionT = setTimeout(() => {
          const p2 = get().pet
          if (p2) { set({ pet: { ...p2, state: 'idle', mood: 'happy' } }); emitPetEvent('idle', 'happy'); startIdleChain(get()) }
        }, REACTION_MS)
      },

      onThinking: () => { clearAll(); set(s => s.pet ? { pet: { ...s.pet, state: 'thinking', mood: 'neutral' } } : {}); emitPetEvent('thinking', 'neutral') },
      onResponded: () => {
        const p = get().pet
        if (!p) return
        set({ pet: { ...p, state: 'idle', mood: 'happy' } })
        emitPetEvent('idle', 'happy')
        startIdleChain(get())
      },
      onWorking: () => { clearAll(); set(s => s.pet ? { pet: { ...s.pet, state: 'working', mood: 'neutral' } } : {}); emitPetEvent('working', 'neutral') },
      onError: () => {
        clearAll()
        set(s => s.pet ? { pet: { ...s.pet, state: 'error', mood: 'sleepy' } } : {})
        emitPetEvent('error', 'sleepy')
        _reactionT = setTimeout(() => {
          const p2 = get().pet
          if (p2) { set({ pet: { ...p2, state: 'idle', mood: 'neutral' } }); emitPetEvent('idle', 'neutral'); startIdleChain(get()) }
        }, REACTION_MS)
      },
      onNotification: () => {
        clearAll()
        set(s => s.pet ? { pet: { ...s.pet, state: 'notification', mood: 'excited' } } : {})
        emitPetEvent('notification', 'excited')
        _reactionT = setTimeout(() => {
          const p2 = get().pet
          if (p2) { set({ pet: { ...p2, state: 'idle' } }); emitPetEvent('idle', p2.mood); startIdleChain(get()) }
        }, REACTION_MS)
      },
    }),
    {
      name: 'snotra-pet',
      partialize: (s) => ({
        pet: s.pet ? { ...s.pet, state: 'idle' as const } : null,
        showPet: s.showPet,
        petWindowVisible: s.petWindowVisible,
        petPosition: s.petPosition,
      }),
    }
  )
)
