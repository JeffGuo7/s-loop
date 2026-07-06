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

type ScheduleMode = 'interval' | 'daily' | 'weekly' | 'once';

const WEEKDAYS = [
  { i: 0, key: 'sun' },
  { i: 1, key: 'mon' },
  { i: 2, key: 'tue' },
  { i: 3, key: 'wed' },
  { i: 4, key: 'thu' },
  { i: 5, key: 'fri' },
  { i: 6, key: 'sat' },
];

function buildSchedule(mode: ScheduleMode, state: {
  intervalNum: number; intervalUnit: string;
  dailyTime: string; weeklyDays: number[]; weeklyTime: string;
  onceAt: string;
}): string {
  switch (mode) {
    case 'interval': {
      const n = Math.max(1, Math.floor(state.intervalNum || 30));
      const u = state.intervalUnit === 'h' ? 'h' : state.intervalUnit === 'd' ? 'd' : 'm';
      return `every ${n}${u}`;
    }
    case 'daily': {
      const [hh, mm] = (state.dailyTime || '09:00').split(':');
      return `${parseInt(mm) || 0} ${parseInt(hh) || 9} * * *`;
    }
    case 'weekly': {
      const [hh, mm] = (state.weeklyTime || '09:00').split(':');
      const days = state.weeklyDays.length > 0 ? state.weeklyDays.sort().join(',') : '*';
      return `${parseInt(mm) || 0} ${parseInt(hh) || 9} * * ${days}`;
    }
    case 'once': {
      const v = state.onceAt;
      if (!v) return '';
      return v.length === 16 ? `${v}:00` : v;
    }
    default:
      return 'every 30m';
  }
}

export function CreateTaskModal({ onClose }: CreateTaskModalProps) {
  const { t } = useTranslation();
  const { createTask } = useTaskStore();
  const { providerConfigs, activeProvider, workspaceDir } = useAppStore();

  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [sMode, setSMode] = useState<ScheduleMode>('interval');
  const [intervalNum, setIntervalNum] = useState(30);
  const [intervalUnit, setIntervalUnit] = useState('m');
  const [dailyTime, setDailyTime] = useState('09:00');
  const [weeklyDays, setWeeklyDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [weeklyTime, setWeeklyTime] = useState('09:00');
  const [onceAt, setOnceAt] = useState('');
  const [deliver, setDeliver] = useState<TaskDelivery>('silent');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const deliveryOptions: Array<{ id: TaskDelivery; label: string }> = [
    { id: 'silent', label: t('tasks.deliverSilent') },
    ...PLATFORM_PRESETS.map((p) => ({ id: p.id as TaskDelivery, label: p.name })),
  ];

  const scheduleValue = buildSchedule(sMode, { intervalNum, intervalUnit, dailyTime, weeklyDays, weeklyTime, onceAt });

  const handleSubmit = async () => {
    if (!name.trim() || !prompt.trim() || !scheduleValue.trim()) return;
    setError(null);
    setSaving(true);
    try {
      const schedule = parseSchedule(scheduleValue.trim());
      await createTask({
        name: name.trim(), prompt: prompt.trim(), schedule,
        provider: activeProvider,
        model: providerConfigs[activeProvider]?.model || '',
        apiKey: providerConfigs[activeProvider]?.apiKey || '',
        workspaceDir: workspaceDir || undefined,
        deliver, enabled: true,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (d: number) => {
    setWeeklyDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-white dark:bg-surface rounded-2xl shadow-2xl animate-fade-in-up overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 pt-5 pb-4">
          <h2 className="text-lg font-bold text-text">{t('createTask.title')}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-secondary text-text-tertiary hover:text-text transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 sm:px-6 pb-2 space-y-4 max-h-[60vh] overflow-y-auto scrollbar-subtle">
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
              placeholder={t('createTask.promptPlaceholder')} rows={3}
              className="w-full px-3.5 py-2.5 rounded-lg bg-surface-secondary/50 border border-border-light focus:border-accent/40 outline-none text-[13px] font-medium leading-relaxed resize-none placeholder:text-text-quaternary transition-colors" />
          </div>

          {/* Schedule builder */}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wide">{t('createTask.scheduleLabel')}</label>

            {/* Mode tabs */}
            <div className="flex gap-1 p-1 rounded-lg bg-surface-secondary/60">
              {(['interval', 'daily', 'weekly', 'once'] as ScheduleMode[]).map((m) => (
                <button key={m} onClick={() => setSMode(m)}
                  className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-colors ${
                    sMode === m ? 'bg-white dark:bg-surface text-text shadow-sm' : 'text-text-tertiary hover:text-text'
                  }`}>
                  {t(`tasks.scheduleMode.${m}`)}
                </button>
              ))}
            </div>

            {/* Interval inputs */}
            {sMode === 'interval' && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-text-tertiary">{t('tasks.every')}</span>
                <input type="number" value={intervalNum} min={1} max={999}
                  onChange={(e) => setIntervalNum(parseInt(e.target.value) || 1)}
                  className="w-16 px-2.5 py-1.5 rounded-lg bg-surface-secondary/50 border border-border-light focus:border-accent/40 outline-none text-[13px] font-medium text-center" />
                <select value={intervalUnit} onChange={(e) => setIntervalUnit(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-surface-secondary/50 border border-border-light focus:border-accent/40 outline-none text-[13px] font-medium appearance-none cursor-pointer">
                  <option value="m">{t('tasks.unitMinutes')}</option>
                  <option value="h">{t('tasks.unitHours')}</option>
                </select>
              </div>
            )}

            {/* Daily inputs */}
            {sMode === 'daily' && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-text-tertiary">{t('tasks.at')}</span>
                <input type="time" value={dailyTime}
                  onChange={(e) => setDailyTime(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-surface-secondary/50 border border-border-light focus:border-accent/40 outline-none text-[13px] font-medium" />
              </div>
            )}

            {/* Weekly inputs */}
            {sMode === 'weekly' && (
              <div className="space-y-2">
                <div className="flex gap-1 flex-wrap">
                  {WEEKDAYS.map((d) => (
                    <button key={d.key} onClick={() => toggleDay(d.i)}
                      className={`w-8 h-8 rounded-lg text-[11px] font-semibold transition-colors border ${
                        weeklyDays.includes(d.i)
                          ? 'bg-accent text-white border-accent'
                          : 'bg-surface-secondary/40 border-border-light text-text-tertiary hover:border-accent/30'
                      }`}>
                      {t(`tasks.weekdays.${d.key}`)}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-text-tertiary">{t('tasks.at')}</span>
                  <input type="time" value={weeklyTime}
                    onChange={(e) => setWeeklyTime(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-surface-secondary/50 border border-border-light focus:border-accent/40 outline-none text-[13px] font-medium" />
                </div>
              </div>
            )}

            {/* Once inputs */}
            {sMode === 'once' && (
              <input type="datetime-local" value={onceAt}
                onChange={(e) => setOnceAt(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg bg-surface-secondary/50 border border-border-light focus:border-accent/40 outline-none text-[13px] font-medium" />
            )}

            {/* Preview */}
            <p className="text-[10px] text-text-quaternary font-mono">{scheduleValue}</p>
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
