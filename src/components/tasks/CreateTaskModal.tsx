import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useTaskStore, useAppStore } from '../../stores';
import { X, ChevronDown } from 'lucide-react';
import { MagicButton } from '../ui';
import { parseSchedule } from '../../types/task';

interface CreateTaskModalProps {
  onClose: () => void;
}

const SCHEDULE_OPTIONS = [
  { value: 'every 30m', key: 'every30m' },
  { value: 'every 1h', key: 'every1h' },
  { value: 'every 2h', key: 'every2h' },
  { value: 'every 6h', key: 'every6h' },
  { value: '0 9 * * *', key: 'daily9am' },
  { value: '0 9 * * 1-5', key: 'weekdays9am' },
  { value: '0 9 * * 1', key: 'weeklyMon9am' },
  { value: '', key: 'custom' },
];

export function CreateTaskModal({ onClose }: CreateTaskModalProps) {
  const { t } = useTranslation();
  const { createTask } = useTaskStore();
  const { providerConfigs, activeProvider, workspaceDir } = useAppStore();

  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [scheduleMode, setScheduleMode] = useState('every 30m');
  const [customSchedule, setCustomSchedule] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isCustom = scheduleMode === '';
  const scheduleValue = isCustom ? customSchedule : scheduleMode;

  const handleSubmit = async () => {
    if (!name.trim() || !prompt.trim() || !scheduleValue.trim()) return;
    setError(null);
    setSaving(true);
    try {
      const schedule = parseSchedule(scheduleValue.trim());
      await createTask({
        name: name.trim(),
        prompt: prompt.trim(),
        schedule,
        provider: activeProvider,
        model: providerConfigs[activeProvider]?.model || '',
        apiKey: providerConfigs[activeProvider]?.apiKey || '',
        workspaceDir: workspaceDir || undefined,
        deliver: 'silent',
        enabled: true,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-surface rounded-2xl shadow-2xl animate-fade-in-up overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 pt-5 pb-4">
          <h2 className="text-lg font-bold text-text">{t('createTask.title')}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-secondary text-text-tertiary hover:text-text transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 sm:px-6 pb-2 space-y-4 max-h-[55vh] overflow-y-auto scrollbar-subtle">
          {/* Name */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wide">{t('createTask.taskName')}</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder={t('createTask.taskPlaceholder')} autoFocus
              className="w-full px-3.5 py-2.5 rounded-lg bg-surface-secondary/50 border border-border-light focus:border-accent/40 outline-none text-[13px] font-medium placeholder:text-text-quaternary transition-colors" />
          </div>

          {/* Prompt */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wide">{t('createTask.promptInstruction')}</label>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('createTask.promptPlaceholder')} rows={4}
              className="w-full px-3.5 py-2.5 rounded-lg bg-surface-secondary/50 border border-border-light focus:border-accent/40 outline-none text-[13px] font-medium leading-relaxed resize-none placeholder:text-text-quaternary transition-colors" />
          </div>

          {/* Schedule */}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wide">{t('createTask.scheduleLabel')}</label>

            {/* Dropdown */}
            <div className="relative">
              <select
                value={scheduleMode}
                onChange={(e) => setScheduleMode(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-surface-secondary/50 border border-border-light focus:border-accent/40 outline-none text-[13px] font-medium text-text appearance-none cursor-pointer transition-colors"
              >
                {SCHEDULE_OPTIONS.map((opt) => (
                  <option key={opt.key} value={opt.value}>
                    {t(`tasks.scheduleOptions.${opt.key}`)}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-quaternary pointer-events-none" />
            </div>

            {/* Custom cron input (only when "Custom" selected) */}
            {isCustom && (
              <input
                type="text"
                value={customSchedule}
                onChange={(e) => setCustomSchedule(e.target.value)}
                placeholder="0 9 * * *"
                className="w-full px-3.5 py-2 rounded-lg bg-surface-secondary/50 border border-border-light focus:border-accent/40 outline-none text-[12px] font-mono placeholder:text-text-quaternary transition-colors"
              />
            )}
          </div>

          {error && <p className="text-[12px] font-medium text-red-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-4 bg-surface-secondary/40 border-t border-border-light flex items-center justify-end gap-3 mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[12px] font-semibold text-text-tertiary hover:text-text transition-colors">
            {t('createTask.discard')}
          </button>
          <MagicButton onClick={handleSubmit} isDisabled={!name.trim() || !prompt.trim() || !scheduleValue.trim() || saving}
            className="px-5 py-2 rounded-lg shadow shadow-accent/15">
            <span className="text-[12px] font-bold">{saving ? t('common.saving') : t('createTask.scheduleAutomation')}</span>
          </MagicButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
