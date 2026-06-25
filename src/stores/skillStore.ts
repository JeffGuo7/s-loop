import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import type { SkillInfo } from '../types/skill';

/// Skills CLI search result
export interface SkillsCLISearchResult {
  id: string;
  name: string;
  source: string;
  installs: number;
  /** Source type hint: "clawhub" | "skillsh" | "github" */
  sourceType?: string;
}

/// Skills CLI install result
export interface SkillsCLIInstallResult {
  success: boolean;
  message: string;
  skill_name: string | null;
  skill_path: string | null;
}

/// ClawHub search raw result (matches Rust RemoteSkillEntry)
export interface ClawHubSkillEntry {
  id: string;
  slug: string;
  name: string;
  description: string;
  source: string;
  owner: string | null;
  downloads: number | null;
  install_mode: string;
}

interface SkillFileEntry {
  name: string;
  description: string;
  content: string;
  body: string;
  path: string;
  emoji: string;
  version: string;
}

interface SkillState {
  skills: SkillInfo[];
  paths: string[];
  skillMeta: Record<string, { emoji: string; version: string }>;

  // Scan status
  isScanning: boolean;
  lastScanTime: number | null;
  scanError: string | null;

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
  installSkillZip: (
    zipBase64: string,
    options?: { targetDir?: string; sourcePathHint?: string }
  ) => Promise<SkillInfo>;

  // Skills CLI (replaces old ClawHub/SkillHub remote system)
  skillsCliSearch: (query: string) => Promise<SkillsCLISearchResult[]>;
  skillsCliInstall: (slug: string, skillName?: string) => Promise<SkillsCLIInstallResult>;
  clawhubSearch: (query: string) => Promise<ClawHubSkillEntry[]>;
  clawhubInstall: (slug: string, skillName?: string) => Promise<SkillsCLIInstallResult>;
  skillsCliUpdate: () => Promise<void>;
  skillsCliRemove: (skillName: string) => Promise<void>;

  // Scan status actions
  setScanning: (scanning: boolean) => void;
  clearScanError: () => void;
}

export const useSkillStore = create<SkillState>()(
  persist(
    (set, get) => ({
      skills: [],
      paths: [],
      skillMeta: {},
      isScanning: false,
      lastScanTime: null,
      scanError: null,

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
        // Also delete skill files from disk (fire and forget)
        invoke('delete_skill_files', { skillName: name }).catch(() => {});
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
        const { paths, skills: existingSkills, isScanning } = get();

        if (isScanning) return;

        if (!paths.length) {
          set({ skills: [], skillMeta: {}, lastScanTime: Date.now(), scanError: null });
          return;
        }

        get().setScanning(true);

        try {
          let discovered: SkillFileEntry[];
          try {
            discovered = await invoke<SkillFileEntry[]>('scan_skill_files', { paths });
          } catch {
            set({
              scanError: 'Tauri command scan_skill_files not available — are you running in the desktop app?',
            });
            return;
          }

          const newSkills = discovered.map((file) => {
            const existing = existingSkills.find(
              (s) => s.name === file.name || s.location === file.path
            );

            return {
              name: file.name,
              description: file.description,
              content: file.body || file.content,
              location: file.path,
              enabled: existing?.enabled ?? true,
              hooks: existing?.hooks,
            } as SkillInfo;
          });

          const meta: Record<string, { emoji: string; version: string }> = {};
          for (const file of discovered) {
            meta[file.name] = { emoji: file.emoji || '📋', version: file.version || '' };
          }

          set({
            skills: newSkills,
            skillMeta: meta,
            lastScanTime: Date.now(),
            scanError: null,
          });
        } catch (error) {
          set({
            scanError: error instanceof Error ? error.message : 'Unknown scanning error',
          });
        } finally {
          get().setScanning(false);
        }
      },

      installSkillZip: async (zipBase64, options) => {
        const targetDir = options?.targetDir || 'managed-skills';
        const installed = await invoke<{
          name: string;
          description: string;
          content: string;
          path: string;
        }>('extract_skill_zip', {
          zipBase64,
          targetDir,
          sourcePathHint: options?.sourcePathHint ?? null,
        });

        get().addPath(targetDir);
        get().addSkill({
          name: installed.name,
          description: installed.description,
          content: installed.content,
          location: installed.path,
          enabled: true,
        });
        await get().refreshSkills();

        const latest = get().skills.find((skill) => skill.name === installed.name);
        return latest || {
          name: installed.name,
          description: installed.description,
          content: installed.content,
          location: installed.path,
          enabled: true,
        };
      },

      // Skills CLI: search via skills.sh API
      skillsCliSearch: async (query: string) => {
        return invoke<SkillsCLISearchResult[]>('skills_cli_search', { query });
      },

      // Skills CLI: install via ClawHub only (no git/npx needed)
      skillsCliInstall: async (
        slug: string,
        skillName?: string
      ): Promise<SkillsCLIInstallResult> => {
        const result = await get().clawhubInstall(slug, skillName);
        return result;
      },

      // ClawHub: install via clawhub.ai (HTTP download, no git/npx needed)
      clawhubInstall: async (
        slug: string,
        skillName?: string
      ): Promise<SkillsCLIInstallResult> => {
        const result = await invoke<SkillsCLIInstallResult>('clawhub_install_skill', {
          slug,
          skillName: skillName ?? null,
        });

        if (result.success && result.skill_path) {
          get().addPath(result.skill_path);
          void get().refreshSkills();
        }

        return result;
      },

      // ClawHub: search via clawhub.ai API
      clawhubSearch: async (query: string) => {
        return invoke<ClawHubSkillEntry[]>('search_remote_skills', {
          source: 'clawhub',
          query: query || null,
        });
      },

      // Skills CLI: update installed skills
      skillsCliUpdate: async () => {
        await invoke<string>('skills_cli_update');
        await get().refreshSkills();
      },

      // Skills CLI: remove a skill
      skillsCliRemove: async (skillName: string) => {
        await invoke<string>('skills_cli_remove', { skillName });
        await get().refreshSkills();
      },

      setScanning: (scanning) => set({ isScanning: scanning }),

      clearScanError: () => set({ scanError: null }),
    }),
    {
      name: 'snotra-skill-storage',
      partialize: (state) => ({
        skills: state.skills,
        paths: state.paths,
        skillMeta: state.skillMeta,
        lastScanTime: state.lastScanTime,
      }),
    }
  )
);
