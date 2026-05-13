import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Pet, PetPosition } from '../types/pet';
import { generatePetAppearance, generatePetId } from '../utils/pet';

interface PetState {
  // Current pet
  pet: Pet | null;

  // Pet display settings
  showPet: boolean;
  petPosition: PetPosition;

  // Actions
  hatchPet: (name: string, personality: string) => Pet;
  dismissPet: () => void;
  updatePetMood: (mood: Pet['mood']) => void;
  interactWithPet: () => void;

  setShowPet: (show: boolean) => void;
  setPetPosition: (position: PetPosition) => void;
  movePet: (delta: { x: number; y: number }) => void;
}

export const usePetStore = create<PetState>()(
  persist(
    (set) => ({
      pet: null,
      showPet: false,
      petPosition: { x: 100, y: 100 },

      hatchPet: (name, personality) => {
        const id = generatePetId();
        const appearance = generatePetAppearance(id);
        const now = Date.now();

        const newPet: Pet = {
          id,
          name,
          personality,
          ...appearance,
          hatchedAt: now,
          lastInteraction: now,
          mood: 'excited',
        };

        set({ pet: newPet, showPet: true });
        return newPet;
      },

      dismissPet: () => {
        set({ pet: null, showPet: false });
      },

      updatePetMood: (mood) => {
        set((state) => {
          if (!state.pet) return {};
          return { pet: { ...state.pet, mood } };
        });
      },

      interactWithPet: () => {
        set((state) => {
          if (!state.pet) return {};
          return {
            pet: {
              ...state.pet,
              lastInteraction: Date.now(),
              mood: 'happy',
            },
          };
        });
      },

      setShowPet: (show) => {
        set({ showPet: show });
      },

      setPetPosition: (position) => {
        set({ petPosition: position });
      },

      movePet: (delta) => {
        set((state) => ({
          petPosition: {
            x: Math.max(0, Math.min(window.innerWidth - 80, state.petPosition.x + delta.x)),
            y: Math.max(0, Math.min(window.innerHeight - 80, state.petPosition.y + delta.y)),
          },
        }));
      },
    }),
    {
      name: 'snotra-pet-storage',
      partialize: (state) => ({
        pet: state.pet,
        showPet: state.showPet,
        petPosition: state.petPosition,
      }),
    }
  )
);