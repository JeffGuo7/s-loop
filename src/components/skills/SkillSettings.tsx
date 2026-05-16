import { useState } from 'react';
import {
  Sparkles,
  Plus,
  Trash2,
  Power,
  PowerOff,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  FileCode,
} from 'lucide-react';
import { useSkillStore } from '../../stores';
import type { SkillInfo } from '../../types/skill';

export function SkillSettings() {
  const { skills, paths, removeSkill, toggleSkill, addPath, removePath } = useSkillStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPathModal, setShowPathModal] = useState(false);
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);

  const enabledCount = skills.filter((s) => s.enabled).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Skills</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {enabledCount} of {skills.length} skills enabled
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPathModal(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <FolderOpen className="w-4 h-4" />
            Paths
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-[var(--color-primary)] text-white rounded-md hover:bg-blue-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Skill
          </button>
        </div>
      </div>

      {skills.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <Sparkles className="w-12 h-12 mx-auto mb-2 opacity-50" />
          <p>No skills configured</p>
          <p className="text-sm">Add a skill or configure a path to discover skills</p>
        </div>
      ) : (
        <div className="space-y-2">
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
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 cursor-pointer"
        onClick={onToggleExpand}
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-500" />
          )}
          <Sparkles className={`w-4 h-4 ${skill.enabled ? 'text-[var(--color-primary)]' : 'text-gray-400'}`} />
          <span className="font-medium">{skill.name}</span>
          {skill.location === 'builtin' && (
            <span className="text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
              builtin
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title={skill.enabled ? 'Disable' : 'Enable'}
          >
            {skill.enabled ? (
              <Power className="w-4 h-4 text-[var(--color-success)]" />
            ) : (
              <PowerOff className="w-4 h-4 text-gray-400" />
            )}
          </button>
          {skill.location !== 'builtin' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
              title="Remove"
            >
              <Trash2 className="w-4 h-4 text-[var(--color-error)]" />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="p-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
          <div className="text-sm text-gray-600 dark:text-gray-300">{skill.description}</div>

          <div className="text-sm">
            <span className="text-gray-500 dark:text-gray-400">Location: </span>
            <span className="font-mono text-xs">{skill.location}</span>
          </div>

          {skill.hooks && (skill.hooks.pre || skill.hooks.post) && (
            <div className="text-sm">
              <span className="text-gray-500 dark:text-gray-400">Hooks: </span>
              <div className="mt-1 space-x-1">
                {skill.hooks.pre?.map((hook, i) => (
                  <span
                    key={i}
                    className="inline-block text-xs px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded"
                  >
                    pre: {hook}
                  </span>
                ))}
                {skill.hooks.post?.map((hook, i) => (
                  <span
                    key={i}
                    className="inline-block text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded"
                  >
                    post: {hook}
                  </span>
                ))}
              </div>
            </div>
          )}

          {skill.content && (
            <div className="mt-2">
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Content:</div>
              <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-2 rounded overflow-auto max-h-40">
                {skill.content}
              </pre>
            </div>
          )}
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-lg">
        <h3 className="text-lg font-semibold mb-4">Add Skill</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
              placeholder="my-skill"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
              placeholder="A brief description of what this skill does"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 font-mono text-sm"
              rows={6}
              placeholder="Skill instructions..."
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-[var(--color-primary)] text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              Add Skill
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <h3 className="text-lg font-semibold mb-4">Skill Paths</h3>

        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Add directories to scan for SKILL.md files
        </p>

        <div className="space-y-2 mb-4">
          {paths.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-2">
              No paths configured
            </p>
          ) : (
            paths.map((path) => (
              <div
                key={path}
                className="flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-700 rounded"
              >
                <div className="flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-mono">{path}</span>
                </div>
                <button
                  onClick={() => removePath(path)}
                  className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                >
                  <Trash2 className="w-4 h-4 text-[var(--color-error)]" />
                </button>
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleAddPath} className="flex gap-2">
          <input
            type="text"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-sm"
            placeholder="~/skills or ./skills"
          />
          <button
            type="submit"
            className="px-3 py-2 text-sm bg-[var(--color-primary)] text-white rounded-md hover:bg-blue-600 transition-colors"
          >
            Add
          </button>
        </form>

        <div className="flex justify-end mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
