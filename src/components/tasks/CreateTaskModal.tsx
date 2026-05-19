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
    <div className="modal-overlay p-4">
      <div className="modal-content w-full max-w-2xl">
        {/* Header */}
        <div className="modal-header">
          <div>
            <p className="section-kicker mb-2">Automation</p>
            <h2 className="section-heading">New Scheduled Task</h2>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-icon"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="modal-body space-y-6">
          {/* Info Banner */}
          <div className="surface-panel-subtle flex items-center gap-3 p-4">
            <Clock size={18} className="text-(--color-accent)" />
            <p className="text-sm text-(--color-text-secondary)">
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
              className="field-shell"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Description <span className="text-(--color-text-secondary)">(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this task..."
              className="field-shell"
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
              className="field-shell resize-none"
            />
          </div>

          {/* Frequency & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Frequency</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as TaskFrequency)}
                className="field-shell"
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
                className="field-shell"
              />
            </div>
          </div>

          {/* Working Directory */}
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm font-medium">
              <FolderOpen size={14} />
              Working Directory <span className="text-(--color-text-secondary)">(optional)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={workingDirectory}
                onChange={(e) => setWorkingDirectory(e.target.value)}
                placeholder="/path/to/project"
                className="field-shell flex-1"
              />
              <button
                type="button"
                className="btn btn-secondary"
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
                className="field-shell"
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
                className="field-shell"
              >
                <option value="ask">Ask before actions</option>
                <option value="auto">Auto-approve</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer bg-(--color-surface-secondary)/55">
          <button
            onClick={onClose}
            className="btn btn-ghost"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || !prompt.trim() || !scheduledTime}
            className="btn btn-primary"
          >
            Create Task
          </button>
        </div>
      </div>
    </div>
  );
}
