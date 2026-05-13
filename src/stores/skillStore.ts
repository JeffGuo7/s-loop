import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SkillInfo } from '../types/skill';

interface SkillState {
  skills: SkillInfo[];
  paths: string[];

  // Actions
  addSkill: (skill: SkillInfo) => void;
  updateSkill: (name: string, updates: Partial<SkillInfo>) => void;
  removeSkill: (name: string) => void;
  toggleSkill: (name: string) => void;

  // Paths
  addPath: (path: string) => void;
  removePath: (path: string) => void;

  // Discovery
  refreshSkills: () => Promise<void>;
}

export const useSkillStore = create<SkillState>()(
  persist(
    (set, get) => ({
      skills: [],
      paths: [],

      addSkill: (skill) => {
        set((state) => ({
          skills: [...state.skills.filter((s) => s.name !== skill.name), skill],
        }));
      },

      updateSkill: (name, updates) => {
        set((state) => ({
          skills: state.skills.map((s) =>
            s.name === name ? { ...s, ...updates } : s
          ),
        }));
      },

      removeSkill: (name) => {
        set((state) => ({
          skills: state.skills.filter((s) => s.name !== name),
        }));
      },

      toggleSkill: (name) => {
        set((state) => ({
          skills: state.skills.map((s) =>
            s.name === name ? { ...s, enabled: !s.enabled } : s
          ),
        }));
      },

      addPath: (path) => {
        set((state) => ({
          paths: [...new Set([...state.paths, path])],
        }));
      },

      removePath: (path) => {
        set((state) => ({
          paths: state.paths.filter((p) => p !== path),
        }));
      },

      refreshSkills: async () => {
        const { paths, skills: existingSkills } = get();

        // Keep built-in skills and skills from paths
        // In a real implementation, this would scan the paths for SKILL.md files
        // For now, we just preserve the existing state
        const preservedSkills = existingSkills.filter(
          (s) => s.location === 'builtin' || paths.some((p) => s.location.startsWith(p))
        );

        set({ skills: preservedSkills });
      },
    }),
    {
      name: 'snotra-skill-storage',
      partialize: (state) => ({
        skills: state.skills,
        paths: state.paths,
      }),
    }
  )
);
