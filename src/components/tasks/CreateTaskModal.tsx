import { useState } from 'react';
import { useTaskStore, useAppStore } from '../../stores';
import { X, Clock, FolderOpen, Cpu, Shield } from 'lucide-react';
import type { TaskFrequency } from '../../types/task';

interface CreateTaskModalProps {
  onClose: () => void;
}

export function CreateTaskModal({ onClose }: CreateTaskModalProps) {
  const { createTask } = useTaskStore();
  const { providerConfigs, activeProvider } = useAppStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');
  const [frequency, setFrequency] = useState<TaskFrequency>('once');
  const [scheduledTime, setScheduledTime] = useState('');
  const [workingDirectory, setWorkingDirectory] = useState('');
  const [permissionMode, setPermissionMode] = useState<'auto' | 'ask'>('ask');
  const [model, setModel] = useState(providerConfigs[activeProvider].model);

  const handleSubmit = () => {
    if (!name.trim() || !prompt.trim() || !scheduledTime) return;

    createTask({
      name: name.trim(),
      description: description.trim(),
      prompt: prompt.trim(),
      frequency,
      scheduledTime,
      workingDirectory: workingDirectory.trim() || undefined,
      model,
      permissionMode,
      enabled: true,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg max-h-[90vh] bg-[var(--color-surface)] rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-xl font-bold">New Scheduled Task</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[var(--color-surface-secondary)] transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Info Banner */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--color-surface-secondary)]">
            <Clock size={18} className="text-[var(--color-accent)]" />
            <p className="text-sm text-[var(--color-text-secondary)]">
              Tasks run while Snotra is open. Schedule AI prompts to execute automatically.
            </p>
          </div>

          {/* Task Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Task Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Daily Code Review"
              className="w-full px-4 py-2 rounded-lg bg-[var(--color-surface-secondary)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)]"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Description <span className="text-[var(--color-text-secondary)]">(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this task..."
              className="w-full px-4 py-2 rounded-lg bg-[var(--color-surface-secondary)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)]"
            />
          </div>

          {/* Prompt */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What should the AI do when this task runs?"
              rows={4}
              className="w-full px-4 py-2 rounded-lg bg-[var(--color-surface-secondary)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] resize-none"
            />
          </div>

          {/* Frequency & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Frequency</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as TaskFrequency)}
                className="w-full px-4 py-2 rounded-lg bg-[var(--color-surface-secondary)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)]"
              >
                <option value="once">Once</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Scheduled Time</label>
              <input
                type="datetime-local"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-[var(--color-surface-secondary)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)]"
              />
            </div>
          </div>

          {/* Working Directory */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm font-medium">
              <FolderOpen size={14} />
              Working Directory <span className="text-[var(--color-text-secondary)]">(optional)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={workingDirectory}
                onChange={(e) => setWorkingDirectory(e.target.value)}
                placeholder="/path/to/project"
                className="flex-1 px-4 py-2 rounded-lg bg-[var(--color-surface-secondary)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)]"
              />
              <button
                type="button"
                className="px-3 rounded-lg bg-[var(--color-surface-secondary)] border border-[var(--color-border)] hover:bg-[var(--color-border)] transition-colors"
              >
                Browse
              </button>
            </div>
          </div>

          {/* Model & Permission */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Cpu size={14} />
                Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-[var(--color-surface-secondary)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)]"
              >
                <option value={providerConfigs.anthropic.model}>
                  {providerConfigs.anthropic.model} (Anthropic)
                </option>
                <option value={providerConfigs.openai.model}>
                  {providerConfigs.openai.model} (OpenAI)
                </option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Shield size={14} />
                Permission Mode
              </label>
              <select
                value={permissionMode}
                onChange={(e) => setPermissionMode(e.target.value as 'auto' | 'ask')}
                className="w-full px-4 py-2 rounded-lg bg-[var(--color-surface-secondary)] border border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)]"
              >
                <option value="ask">Ask before actions</option>
                <option value="auto">Auto-approve</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface-secondary)]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg hover:bg-[var(--color-surface)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || !prompt.trim() || !scheduledTime}
            className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            Create Task
          </button>
        </div>
      </div>
    </div>
  );
}