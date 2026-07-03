import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useTaskStore, useAppStore } from '../../stores';
import { X } from 'lucide-react';
import { MagicButton } from '../ui';
import { parseSchedule } from '../../types/task';
import { PLATFORM_PRESETS } from '../../types/platform';
import type { TaskDelivery } from '../../types/task';

interface CreateTaskModalProps {
  onClose: () => void;
}

export function CreateTaskModal({ onClose }: CreateTaskModalProps) {
  const { t } = useTranslation();
  const { createTask } = useTaskStore();
  const { providerConfigs, activeProvider, activeSessionId, workspaceDir, createSession } = useAppStore();

  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [scheduleInput, setScheduleInput] = useState('every 30m');
  const [schedulePreset, setSchedulePreset] = useState('every 30m');
  const [deliver, setDeliver] = useState<TaskDelivery>('chat');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const schedulePresets = [
    { key: 'every30m', value: 'every 30m' },
    { key: 'everyHour', value: 'every 1h' },
    { key: 'daily9am', value: '0 9 * * *' },
    { key: 'weekdays8am', value: '0 8 * * 1-5' },
    { key: 'weeklyMon', value: '0 9 * * 1' },
    { key: 'custom', value: '' },
  ];

  const deliveryOptions: Array<{ id: TaskDelivery; label: string }> = [
    { id: 'chat', label: t('tasks.deliverChat') },
    { id: 'silent', label: t('tasks.deliverSilent') },
    ...PLATFORM_PRESETS.map((p) => ({ id: p.id as TaskDelivery, label: p.name })),
  ];

  const handleSubmit = async () => {
    if (!name.trim() || !prompt.trim() || !scheduleInput.trim()) return;
    setError(null);
    setSaving(true);
    try {
      const schedule = parseSchedule(scheduleInput.trim());
      await createTask({
        name: name.trim(),
        prompt: prompt.trim(),
        schedule,
        provider: activeProvider,
        model: providerConfigs[activeProvider]?.model || '',
        apiKey: providerConfigs[activeProvider]?.apiKey || '',
        workspaceDir: workspaceDir || undefined,
        deliver,
        deliverSessionId: deliver === 'chat' ? (activeSessionId || createSession()) : undefined,
        enabled: true,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handlePresetClick = (value: string) => {
    setSchedulePreset(value);
    if (value) setScheduleInput(value);
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
            <div className="flex flex-wrap gap-1.5">
              {schedulePresets.map((p) => (
                <button key={p.key} onClick={() => handlePresetClick(p.value)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors border ${
                    schedulePreset === p.value
                      ? 'bg-accent text-white border-accent'
                      : 'bg-surface-secondary/40 border-border-light text-text-tertiary hover:text-text hover:border-accent/30'
                  }`}>
                  {t(`tasks.schedulePresets.${p.key}`)}
                </button>
              ))}
            </div>
            <input type="text" value={scheduleInput} onChange={(e) => { setScheduleInput(e.target.value); setSchedulePreset(''); }}
              placeholder="0 9 * * *"
              className="w-full px-3.5 py-2 rounded-lg bg-surface-secondary/50 border border-border-light focus:border-accent/40 outline-none text-[12px] font-mono placeholder:text-text-quaternary transition-colors" />
          </div>

          {/* Delivery */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wide">{t('createTask.deliveryLabel')}</label>
            <div className="flex flex-wrap gap-1.5">
              {deliveryOptions.map((o) => (
                <button key={o.id} onClick={() => setDeliver(o.id)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors border ${
                    deliver === o.id ? 'bg-accent text-white border-accent' : 'bg-surface-secondary/40 border-border-light text-text-tertiary hover:text-text'
                  }`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-[12px] font-medium text-red-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-4 bg-surface-secondary/40 border-t border-border-light flex items-center justify-end gap-3 mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[12px] font-semibold text-text-tertiary hover:text-text transition-colors">
            {t('createTask.discard')}
          </button>
          <MagicButton onClick={handleSubmit} isDisabled={!name.trim() || !prompt.trim() || !scheduleInput.trim() || saving}
            className="px-5 py-2 rounded-lg shadow shadow-accent/15">
            <span className="text-[12px] font-bold">{saving ? t('common.saving') : t('createTask.scheduleAutomation')}</span>
          </MagicButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
