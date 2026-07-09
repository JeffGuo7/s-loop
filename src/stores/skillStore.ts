import { create } from 'zustand';
import { getErrorMessage } from '../utils/errors'
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import type { SkillInfo } from '../types/skill';
import { useAgentStore } from './agentStore';

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

interface SkillPrefs {
  enabled: boolean;
  hooks?: { pre?: string[]; post?: string[] };
}

const SKILLS_BASE = '~/.pi/agent/skills';

interface SkillState {
  // From disk scan — never persisted
  skills: SkillInfo[];
  skillMeta: Record<string, { emoji: string; version: string }>;
  isScanning: boolean;
  lastScanTime: number | null;
  scanError: string | null;

  // Persisted
  paths: string[];
  skillPrefs: Record<string, SkillPrefs>;

  // Actions
  addSkill: (name: string, description: string, content: string) => Promise<void>;
  updateSkill: (name: string, updates: Partial<SkillInfo>) => void;
  removeSkill: (name: string) => Promise<void>;
  toggleSkill: (name: string) => void;
  addPath: (path: string) => void;
  removePath: (path: string) => void;
  refreshSkills: () => Promise<void>;
  installSkillZip: (
    zipBase64: string,
    options?: { targetDir?: string; sourcePathHint?: string }
  ) => Promise<SkillInfo>;
  skillsCliSearch: (query: string) => Promise<SkillsCLISearchResult[]>;
  skillsCliInstall: (slug: string, skillName?: string) => Promise<SkillsCLIInstallResult>;
  clawhubSearch: (query: string) => Promise<ClawHubSkillEntry[]>;
  clawhubInstall: (slug: string, skillName?: string) => Promise<SkillsCLIInstallResult>;
  skillsCliUpdate: () => Promise<void>;
  skillsCliRemove: (skillName: string) => Promise<void>;
  setScanning: (scanning: boolean) => void;
  clearScanError: () => void;
}

export const useSkillStore = create<SkillState>()(
  persist(
    (set, get) => ({
      skills: [],
      skillMeta: {},
      isScanning: false,
      lastScanTime: null,
      scanError: null,

      paths: [],
      skillPrefs: {},

      /// Write a manual skill to ~/.pi/agent/skills/{name}/SKILL.md, then rescan.
      addSkill: async (name, description, content) => {
        await invoke<string>('create_skill_file', { name, description, content });
        await get().refreshSkills();
      },

      updateSkill: (name, updates) => {
        if (updates.hooks) {
          set((state) => ({
            skillPrefs: {
              ...state.skillPrefs,
              [name]: { ...state.skillPrefs[name], hooks: updates.hooks },
            },
          }));
        }
        // Reflect in-memory immediately for responsive UI
        set((state) => ({
          skills: state.skills.map((s) =>
            s.name === name ? { ...s, ...updates } : s
          ),
        }));
      },

      /// Delete skill from disk, then rescan. Agents referencing it are cleaned up.
      removeSkill: async (name) => {
        const skill = get().skills.find((s) => s.name === name);
        // Clean up stale agent references first
        try {
          const agentStore = useAgentStore.getState();
          for (const agent of agentStore.agents) {
            if (agent.skills.includes(name)) {
              agentStore.removeSkillFromAgent(agent.id, name);
            }
          }
        } catch { /* agent store may not be loaded yet */ }
        // Await disk deletion, then rescan
        await invoke('delete_skill_files', {
          skillName: name,
          skillPath: skill?.location ?? null,
        });
        await get().refreshSkills();
      },

      toggleSkill: (name) => {
        const current = get().skills.find((s) => s.name === name);
        const newEnabled = !current?.enabled;
        // Update pref
        set((state) => ({
          skillPrefs: {
            ...state.skillPrefs,
            [name]: { ...state.skillPrefs[name], enabled: newEnabled },
          },
          // Also update in-memory for responsive UI
          skills: state.skills.map((s) =>
            s.name === name ? { ...s, enabled: newEnabled } : s
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

      /// Rescan all paths. Rust always includes the default skills dir automatically.
      refreshSkills: async () => {
        const { paths, isScanning, skillPrefs } = get();
        if (isScanning) return;

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

          const seen = new Set<string>();
          const newSkills: SkillInfo[] = [];
          for (const file of discovered) {
            if (seen.has(file.name)) continue;
            seen.add(file.name);

            const prefs = skillPrefs[file.name];
            newSkills.push({
              name: file.name,
              description: file.description,
              content: file.body || file.content,
              location: file.path,
              enabled: prefs?.enabled ?? true,
              hooks: prefs?.hooks,
            } as SkillInfo);
          }

          const meta: Record<string, { emoji: string; version: string }> = {};
          for (const file of discovered) {
            if (!meta[file.name]) {
              meta[file.name] = { emoji: file.emoji || '\u{1F4CB}', version: file.version || '' };
            }
          }

          // Clean up prefs for skills no longer on disk
          const newPrefs: Record<string, SkillPrefs> = {};
          for (const s of newSkills) {
            if (skillPrefs[s.name]) {
              newPrefs[s.name] = skillPrefs[s.name];
            }
          }

          set({
            skills: newSkills,
            skillMeta: meta,
            skillPrefs: newPrefs,
            lastScanTime: Date.now(),
            scanError: null,
          });
        } catch (error) {
          set({
            scanError: getErrorMessage(error, 'Unknown scanning error'),
          });
        } finally {
          get().setScanning(false);
        }
      },

      installSkillZip: async (zipBase64, options) => {
        const targetDir = options?.targetDir || SKILLS_BASE;
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

        if (result.success) {
          await get().refreshSkills();
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
        try {
          const agentStore = useAgentStore.getState();
          for (const agent of agentStore.agents) {
            if (agent.skills.includes(skillName)) {
              agentStore.removeSkillFromAgent(agent.id, skillName);
            }
          }
        } catch { /* agent store may not be loaded yet */ }
        await get().refreshSkills();
      },

      setScanning: (scanning) => set({ isScanning: scanning }),

      clearScanError: () => set({ scanError: null }),
    }),
    {
      name: 'snotra-skill-storage',
      partialize: (state) => ({
        paths: state.paths,
        skillPrefs: state.skillPrefs,
      }),
      // On rehydrate, trigger a rescan so skills reflect current disk state
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error || !state) return;
          // Defer rescan so it doesn't block first render
          setTimeout(() => {
            useSkillStore.getState().refreshSkills().catch(() => {});
          }, 0);
        };
      },
    }
  )
);
