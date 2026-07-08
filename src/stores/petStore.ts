import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Pet, PetAnimationState, PetPackage, PetMood, PetPosition } from '../types/pet'
import { loadPetPackages, getIdleAnimation, getWorkingTierSvg } from '../utils/petTheme'

// ─── Timing constants ─────────────────────────────────────
const IDLE_ANIMATION_GAP = 25_000
const ATTENTION_TIMEOUT = 20_000
const YAWN_TIMEOUT = 40_000
const DOZE_TIMEOUT = 10_000
const COLLAPSE_TIMEOUT = 6_000
const REACTION_MS = 1_500

function uid(): string { return Math.random().toString(36).slice(2, 11) }

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
  activeSessionCount: number

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
    (set, get) => {
      // ─── Timers ──────────────────────────────────────────
      let _idleAnimT: ReturnType<typeof setTimeout> | null = null
      let _sleepT: ReturnType<typeof setTimeout> | null = null
      let _reactionT: ReturnType<typeof setTimeout> | null = null
      let _transitionT: ReturnType<typeof setTimeout> | null = null

      function clearAll() {
        if (_idleAnimT) { clearTimeout(_idleAnimT); _idleAnimT = null }
        if (_sleepT) { clearTimeout(_sleepT); _sleepT = null }
        if (_reactionT) { clearTimeout(_reactionT); _reactionT = null }
        if (_transitionT) { clearTimeout(_transitionT); _transitionT = null }
      }

      function scheduleIdleAnimation() {
        if (_idleAnimT) clearTimeout(_idleAnimT)
        _idleAnimT = setTimeout(() => {
          const p = get().pet
          if (!p || p.state !== 'idle') return
          const pkg = get().packages.find(pk => pk.id === p.packageId)
          if (!pkg) return
          const anim = getIdleAnimation(pkg.theme)
          if (anim) {
            set({ pet: { ...p, idleAnimationFile: anim.file } })
            _idleAnimT = setTimeout(() => {
              const p2 = get().pet
              if (p2) {
                set({ pet: { ...p2, idleAnimationFile: null } })
                scheduleIdleAnimation()
              }
            }, anim.duration)
          } else {
            scheduleIdleAnimation()
          }
        }, IDLE_ANIMATION_GAP)
      }

      function startSleepSequence() {
        clearAll()
        _sleepT = setTimeout(() => {
          const p = get().pet
          if (!p || p.state !== 'idle') return
          get().setState('attention')
          _transitionT = setTimeout(() => {
            const p2 = get().pet
            if (!p2 || p2.state !== 'attention') return
            get().setState('yawning')
            _transitionT = setTimeout(() => {
              const p3 = get().pet
              if (!p3 || p3.state !== 'yawning') return
              get().setState('dozing')
              _transitionT = setTimeout(() => {
                const p4 = get().pet
                if (!p4 || p4.state !== 'dozing') return
                get().setState('collapsing')
                _transitionT = setTimeout(() => {
                  const p5 = get().pet
                  if (!p5 || p5.state !== 'collapsing') return
                  get().setState('sleeping')
                }, COLLAPSE_TIMEOUT)
              }, DOZE_TIMEOUT)
            }, YAWN_TIMEOUT)
          }, ATTENTION_TIMEOUT)
        }, ATTENTION_TIMEOUT)
      }

      return {
        pet: null,
        packages: [],
        showPet: false,
        petWindowVisible: false,
        petPosition: { x: 100, y: 100 },
        packagesLoaded: false,
        activeSessionCount: 0,

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

        hatch: (name, personality = 'Friendly', packageId = 'clawd') => {
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
          scheduleIdleAnimation()
          startSleepSequence()
          return p
        },

        dismiss: () => { clearAll(); set({ pet: null, showPet: false }) },

        interact: () => {
          const p = get().pet
          if (!p) return
          clearAll()
          if (p.state === 'sleeping' || p.state === 'collapsing' || p.state === 'dozing') {
            set({ pet: { ...p, state: 'waking', lastInteraction: Date.now(), mood: 'happy' } })
            emitPetEvent('waking', 'happy')
            _reactionT = setTimeout(() => {
              const p2 = get().pet
              if (p2) {
                set({ pet: { ...p2, state: 'idle', mood: 'happy', idleAnimationFile: null } })
                emitPetEvent('idle', 'happy')
                scheduleIdleAnimation()
                startSleepSequence()
              }
            }, 3650)
            return
          }
          set({ pet: { ...p, state: 'attention', lastInteraction: Date.now(), mood: 'happy' } })
          emitPetEvent('attention', 'happy')
          _reactionT = setTimeout(() => {
            const p2 = get().pet
            if (p2) {
              set({ pet: { ...p2, state: 'idle', mood: 'happy', idleAnimationFile: null } })
              emitPetEvent('idle', 'happy')
              scheduleIdleAnimation()
              startSleepSequence()
            }
          }, REACTION_MS)
        },

        onThinking: () => {
          const p = get().pet
          if (!p) return
          clearAll()
          set({ pet: { ...p, state: 'thinking', mood: 'neutral', idleAnimationFile: null } })
          emitPetEvent('thinking', 'neutral')
        },
        onResponded: () => {
          const p = get().pet
          if (!p) return
          set({ pet: { ...p, state: 'idle', mood: 'happy', idleAnimationFile: null }, activeSessionCount: 0 })
          emitPetEvent('idle', 'happy')
          scheduleIdleAnimation()
          startSleepSequence()
        },
        onWorking: () => {
          const p = get().pet
          if (!p) return
          clearAll()
          const count = get().activeSessionCount + 1
          set({ activeSessionCount: count })
          const pkg = get().packages.find(pk => pk.id === p.packageId)
          const tierSvg = pkg ? getWorkingTierSvg(pkg.theme, count) : null
          const workState: PetAnimationState = tierSvg === 'clawd-working-juggling.svg' || tierSvg === 'clawd-headphones-groove.svg'
            ? 'juggling' : 'working'
          set({ pet: { ...p, state: workState, mood: 'neutral', idleAnimationFile: null } })
          emitPetEvent(workState, 'neutral')
        },
        onError: () => {
          const p = get().pet
          if (!p) return
          clearAll()
          set({ pet: { ...p, state: 'error', mood: 'sleepy', idleAnimationFile: null } })
          emitPetEvent('error', 'sleepy')
          _reactionT = setTimeout(() => {
            const p2 = get().pet
            if (p2) {
              set({ pet: { ...p2, state: 'idle', mood: 'neutral', idleAnimationFile: null } })
              emitPetEvent('idle', 'neutral')
              scheduleIdleAnimation()
              startSleepSequence()
            }
          }, REACTION_MS)
        },
        onNotification: () => {
          const p = get().pet
          if (!p) return
          clearAll()
          set({ pet: { ...p, state: 'notification', mood: 'excited', idleAnimationFile: null } })
          emitPetEvent('notification', 'excited')
          _reactionT = setTimeout(() => {
            const p2 = get().pet
            if (p2) {
              set({ pet: { ...p2, state: 'idle', idleAnimationFile: null } })
              emitPetEvent('idle', p2.mood)
              scheduleIdleAnimation()
              startSleepSequence()
            }
          }, REACTION_MS)
        },
      }
    },
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
