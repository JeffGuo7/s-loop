import { useState } from 'react';
import {
  Sparkles,
  Plus,
  Trash2,
  Power,
  PowerOff,
  ChevronDown,
  FolderOpen,
  FileCode,
} from 'lucide-react';
import { useSkillStore } from '../../stores';
import type { SkillInfo } from '../../types/skill';
import { CopyButton } from '../chat/shared/CopyButton';

export function SkillSettings() {
  const { skills, paths, removeSkill, toggleSkill, addPath, removePath } = useSkillStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPathModal, setShowPathModal] = useState(false);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);

  const enabledCount = skills.filter((s) => s.enabled).length;

  return (
    <div className="space-y-8 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold tracking-tight text-[var(--color-text)]">Skills</h3>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            <span className="font-semibold text-[var(--color-accent)]">{enabledCount}</span> of {skills.length} skills active
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowPathModal(true)}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <FolderOpen className="w-4 h-4" />
            Paths
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Skill
          </button>
        </div>
      </div>

      {skills.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 border-2 border-dashed border-[var(--color-border)] rounded-[var(--radius-lg)] bg-[var(--color-surface-secondary)]/50">
          <div className="w-16 h-16 bg-[var(--color-accent-muted)] rounded-full flex items-center justify-center mb-4">
            <Sparkles className="w-8 h-8 text-[var(--color-accent)] opacity-80" />
          </div>
          <h4 className="text-lg font-semibold text-[var(--color-text)]">No skills yet</h4>
          <p className="text-sm text-[var(--color-text-secondary)] text-center max-w-xs mt-2">
            Skills extend AI capabilities. Add one manually or configure a path to discover skills.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {skills.map((skill) => (
            <SkillCard
              key={skill.name}
              skill={skill}
              expanded={expandedSkill === skill.name}
              onToggleExpand={() =>
                setExpandedSkill(expandedSkill === skill.name ? null : skill.name)
              }
              onToggle={() => toggleSkill(skill.name)}
              onRemove={() => removeSkill(skill.name)}
            />
          ))}
        </div>
      )}

      {showAddModal && <AddSkillModal onClose={() => setShowAddModal(false)} />}
      {showPathModal && (
        <SkillPathsModal paths={paths} addPath={addPath} removePath={removePath} onClose={() => setShowPathModal(false)} />
      )}
    </div>
  );
}

interface SkillCardProps {
  skill: SkillInfo;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggle: () => void;
  onRemove: () => void;
}

function SkillCard({ skill, expanded, onToggleExpand, onToggle, onRemove }: SkillCardProps) {
  return (
    <div 
      className={`group transition-all duration-300 border ${
        expanded 
          ? 'border-[var(--color-accent)] shadow-md' 
          : 'border-[var(--color-border)] hover:border-[var(--color-accent-light)]'
      } rounded-[var(--radius-md)] overflow-hidden bg-[var(--color-surface)]`}
    >
      <div
        className={`flex items-center justify-between p-4 cursor-pointer transition-colors ${
          expanded ? 'bg-[var(--color-accent-muted)]' : 'hover:bg-[var(--color-surface-secondary)]'
        }`}
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className={`p-2 rounded-xl transition-colors ${
            skill.enabled ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-surface-secondary)] text-[var(--color-text-tertiary)]'
          }`}>
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[var(--color-text)] truncate">{skill.name}</span>
              {skill.location === 'builtin' && (
                <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-[var(--color-accent-muted)] text-[var(--color-accent)] font-bold rounded-md">
                  builtin
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] truncate mt-0.5">
              {skill.description || 'No description provided'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              skill.enabled 
                ? 'bg-[var(--color-success)]/10 text-[var(--color-success)] hover:bg-[var(--color-success)]/20' 
                : 'bg-[var(--color-surface-secondary)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-tertiary)]'
            }`}
          >
            {skill.enabled ? (
              <><Power className="w-3.5 h-3.5" /> Active</>
            ) : (
              <><PowerOff className="w-3.5 h-3.5" /> Disabled</>
            )}
          </button>
          
          <div className="w-[1px] h-6 bg-[var(--color-border)]" />
          
          {skill.location !== 'builtin' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="p-2 text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] hover:bg-[var(--color-error-bg)] rounded-lg transition-all"
              title="Remove"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          
          <div className={`transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}>
            <ChevronDown className="w-4 h-4 text-[var(--color-text-tertiary)]" />
          </div>
        </div>
      </div>

      {expanded && (
        <div className="p-5 border-t border-[var(--color-border)] bg-[var(--color-surface)] animate-slide-up">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-1.5 block">
                  Location
                </label>
                <div className="flex items-center gap-2 text-sm font-mono text-[var(--color-text-secondary)] bg-[var(--color-surface-secondary)] p-2 rounded-lg">
                  <FolderOpen className="w-3.5 h-3.5" />
                  {skill.location}
                </div>
              </div>

              {skill.hooks && (skill.hooks.pre || skill.hooks.post) && (
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-1.5 block">
                    Execution Hooks
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {skill.hooks.pre?.map((hook, i) => (
                      <span
                        key={i}
                        className="text-[11px] px-2.5 py-1 bg-[var(--color-warning-bg)] text-[var(--color-warning)] border border-[var(--color-warning)]/20 rounded-full font-medium"
                      >
                        pre: {hook}
                      </span>
                    ))}
                    {skill.hooks.post?.map((hook, i) => (
                      <span
                        key={i}
                        className="text-[11px] px-2.5 py-1 bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[var(--color-success)]/20 rounded-full font-medium"
                      >
                        post: {hook}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {skill.content && (
              <div className="flex flex-col">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-text-tertiary)] mb-1.5 block">
                  Instruction Content
                </label>
                <div className="flex-1 relative group/code">
                  <pre className="text-xs bg-[var(--color-surface-secondary)] p-4 rounded-xl overflow-auto max-h-48 font-mono leading-relaxed border border-[var(--color-border)]">
                    {skill.content}
                  </pre>
                  <div className="absolute top-2 right-2 opacity-0 group-hover/code:opacity-100 transition-opacity">
                    <CopyButton text={skill.content} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface AddSkillModalProps {
  onClose: () => void;
}

function AddSkillModal({ onClose }: AddSkillModalProps) {
  const { addSkill } = useSkillStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const skill: SkillInfo = {
      name,
      description,
      content,
      location: 'manual',
      enabled: true,
    };

    addSkill(skill);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-2xl w-full max-w-lg overflow-hidden animate-slide-up">
        <div className="px-8 pt-8 pb-6">
          <h3 className="text-2xl font-bold text-[var(--color-text)]">New Skill</h3>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">Define custom instructions for the AI agent.</p>
        </div>

        <form onSubmit={handleSubmit} className="px-8 pb-8 space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] ml-1">Skill Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-[var(--color-surface-secondary)] border border-[var(--color-border)] rounded-xl focus:ring-2 focus:ring-[var(--color-accent)] transition-all outline-none text-sm"
              placeholder="e.g., code-reviewer"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] ml-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 bg-[var(--color-surface-secondary)] border border-[var(--color-border)] rounded-xl focus:ring-2 focus:ring-[var(--color-accent)] transition-all outline-none text-sm"
              placeholder="What does this skill do?"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] ml-1">System Instructions</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full px-4 py-3 bg-[var(--color-surface-secondary)] border border-[var(--color-border)] rounded-xl focus:ring-2 focus:ring-[var(--color-accent)] transition-all outline-none font-mono text-sm leading-relaxed"
              rows={6}
              placeholder="Act as a senior engineer..."
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary px-8"
            >
              Create Skill
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface SkillPathsModalProps {
  paths: string[];
  addPath: (path: string) => void;
  removePath: (path: string) => void;
  onClose: () => void;
}

function SkillPathsModal({ paths, addPath, removePath, onClose }: SkillPathsModalProps) {
  const [newPath, setNewPath] = useState('');

  const handleAddPath = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPath.trim()) {
      addPath(newPath.trim());
      setNewPath('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-2xl w-full max-w-md overflow-hidden animate-slide-up">
        <div className="px-8 pt-8 pb-6">
          <h3 className="text-2xl font-bold text-[var(--color-text)]">Skill Paths</h3>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">Scan directories for automated skill loading.</p>
        </div>

        <div className="px-8 pb-4">
          <div className="space-y-3 max-h-60 overflow-y-auto pr-2 scrollbar-subtle">
            {paths.length === 0 ? (
              <div className="text-center py-8 bg-[var(--color-surface-secondary)] rounded-xl border border-dashed border-[var(--color-border)]">
                <FolderOpen className="w-8 h-8 text-[var(--color-text-tertiary)] mx-auto mb-2 opacity-50" />
                <p className="text-sm text-[var(--color-text-tertiary)]">No paths configured</p>
              </div>
            ) : (
              paths.map((path: string) => (
                <div
                  key={path}
                  className="flex items-center justify-between p-3 bg-[var(--color-surface-secondary)] rounded-xl border border-[var(--color-border)] group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-1.5 bg-[var(--color-surface)] rounded-lg shadow-sm">
                      <FileCode className="w-4 h-4 text-[var(--color-accent)]" />
                    </div>
                    <span className="text-sm font-mono text-[var(--color-text-secondary)] truncate">{path}</span>
                  </div>
                  <button
                    onClick={() => removePath(path)}
                    className="p-1.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-error)] hover:bg-[var(--color-error-bg)] rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="px-8 pb-8 space-y-6">
          <form onSubmit={handleAddPath} className="flex gap-2">
            <input
              type="text"
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              className="flex-1 px-4 py-2.5 bg-[var(--color-surface-secondary)] border border-[var(--color-border)] rounded-xl focus:ring-2 focus:ring-[var(--color-accent)] outline-none text-sm"
              placeholder="e.g., ./my-skills"
            />
            <button
              type="submit"
              className="btn-primary"
            >
              Add
            </button>
          </form>

          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="btn-secondary w-full"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
