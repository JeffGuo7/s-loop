import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTaskStore, useAppStore, useSkillStore } from '../../stores';
import { X, Clock, Cpu, Shield, BookOpen } from 'lucide-react';
import { MagicButton } from '../ui';
import { parseSchedule } from '../../types/task';
import { PLATFORM_PRESETS } from '../../types/platform';
import type { ScheduleKind, TaskDelivery } from '../../types/task';

interface CreateTaskModalProps {
  onClose: () => void;
}

export function CreateTaskModal({ onClose }: CreateTaskModalProps) {
  const { t } = useTranslation();
  const { createTask } = useTaskStore();
  const { providerConfigs, activeProvider, activeSessionId, workspaceDir, createSession } = useAppStore();
  const { skills } = useSkillStore();

  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [scheduleInput, setScheduleInput] = useState('every 30m');
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>('interval');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [deliver, setDeliver] = useState<TaskDelivery>('chat');
  const [provider, setProvider] = useState(activeProvider);
  const [model, setModel] = useState(providerConfigs[activeProvider]?.model || '');
  const [error, setError] = useState<string | null>(null);

  const deliveryOptions: Array<{ id: TaskDelivery; label: string }> = [
    { id: 'chat', label: t('createTask.deliverChat') },
    { id: 'silent', label: t('createTask.deliverSilent') },
    ...PLATFORM_PRESETS.map((platform) => ({ id: platform.id, label: platform.name })),
  ];

  const handleSubmit = async () => {
    if (!name.trim() || !prompt.trim() || !scheduleInput.trim()) return;
    setError(null);

    try {
      const schedule = parseSchedule(scheduleInput.trim());
      const deliverSessionId = deliver === 'chat'
        ? (activeSessionId || createSession())
        : undefined;
      await createTask({
        name: name.trim(),
        prompt: prompt.trim(),
        schedule,
        skills: selectedSkills,
        provider,
        model,
        apiKey: providerConfigs[provider]?.apiKey || '',
        workspaceDir: workspaceDir || undefined,
        deliver,
        deliverSessionId,
        enabled: true,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const toggleSkill = (skillName: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skillName) ? prev.filter((s) => s !== skillName) : [...prev, skillName],
    );
  };

  const presetExamples = [
    { label: 'Every 30 min', value: 'every 30m' },
    { label: 'Every hour', value: 'every 1h' },
    { label: 'Daily 9am', value: '0 9 * * *' },
    { label: 'Weekdays 8am', value: '0 8 * * 1-5' },
    { label: 'Once in 2h', value: '2h' },
  ];

  return (
    <div className="modal-overlay p-8 sm:p-16">
      <div className="modal-content w-full max-w-3xl rounded-[40px] shadow-3xl">
        {/* Header */}
        <div className="modal-header px-12 pt-12 pb-8 border-b border-border-light">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.4em] text-accent opacity-60 mb-3">{t('createTask.automation')}</p>
            <h2 className="text-3xl font-bold tracking-tighter text-text">{t('createTask.title')}</h2>
          </div>
          <button onClick={onClose} className="p-4 rounded-[20px] bg-surface-secondary/50 text-text-tertiary hover:text-text hover:bg-surface-secondary transition-all duration-500 shadow-sm border border-border-light">
            <X size={22} />
          </button>
        </div>

        {/* Content */}
        <div className="modal-body px-12 py-10 space-y-8 overflow-y-auto max-h-[65vh] scrollbar-subtle">
          {/* Info */}
          <div className="bg-accent-subtle/50 border border-accent/15 rounded-[24px] flex items-start gap-5 p-6">
            <Clock size={20} className="text-accent mt-0.5 shrink-0" />
            <p className="text-[15px] text-text-secondary leading-relaxed font-medium">
              {t('createTask.info')}
            </p>
          </div>

          {/* Name + Model row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <label className="text-[13px] font-bold uppercase tracking-[0.2em] text-text-tertiary ml-1 opacity-70">{t('createTask.taskName')}</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder={t('createTask.taskPlaceholder')}
                className="w-full px-6 py-4.5 rounded-[20px] bg-surface-secondary/40 border border-border-light focus:bg-surface focus:border-accent/40 transition-all outline-none text-[15px] font-bold tracking-tight shadow-inner" />
            </div>
            <div className="space-y-3">
              <label className="flex items-center gap-3 text-[13px] font-bold uppercase tracking-[0.2em] text-text-tertiary ml-1 opacity-70">
                <Cpu size={14} className="text-accent" /> {t('createTask.inferenceModel')}
              </label>
              <select
                value={provider}
                onChange={(e) => {
                  const nextProvider = e.target.value;
                  setProvider(nextProvider);
                  setModel(providerConfigs[nextProvider]?.model || '');
                }}
                className="w-full px-6 py-4.5 rounded-[20px] bg-surface-secondary/40 border border-border-light focus:bg-surface focus:border-accent/40 transition-all outline-none text-[15px] font-bold tracking-tight shadow-inner appearance-none cursor-pointer">
                {Object.keys(providerConfigs).map((p) => (
                  <option key={p} value={p}>{providerConfigs[p].model || t('chat.status.noModel')} ({p})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Prompt */}
          <div className="space-y-3">
            <label className="text-[13px] font-bold uppercase tracking-[0.2em] text-text-tertiary ml-1 opacity-70">{t('createTask.promptInstruction')}</label>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('createTask.promptPlaceholder')} rows={4}
              className="w-full px-6 py-5 rounded-[24px] bg-surface-secondary/40 border border-border-light focus:bg-surface focus:border-accent/40 transition-all outline-none text-[15px] font-medium leading-relaxed shadow-inner resize-none scrollbar-subtle" />
          </div>

          {/* Schedule */}
          <div className="space-y-4">
            <label className="text-[13px] font-bold uppercase tracking-[0.2em] text-text-tertiary ml-1 opacity-70">{t('createTask.scheduleLabel')}</label>
            <div className="flex gap-3 mb-3">
              {(['interval', 'cron', 'once'] as ScheduleKind[]).map((kind) => (
                <button key={kind} onClick={() => { setScheduleKind(kind);
                  setScheduleInput(kind === 'interval' ? 'every 30m' : kind === 'cron' ? '0 9 * * *' : new Date().toISOString().slice(0, 16)); }}
                  className={`px-5 py-2.5 rounded-[14px] text-[13px] font-bold tracking-tight transition-all border ${scheduleKind === kind ? 'bg-accent text-accent-foreground border-accent' : 'bg-surface-secondary/50 border-border-light text-text-tertiary hover:text-text'}`}>
                  {t(`createTask.${kind === 'interval' ? 'intervalLabel' : kind === 'cron' ? 'cronLabel' : 'onceLabel'}`)}
                </button>
              ))}
            </div>

            <input type="text" value={scheduleInput} onChange={(e) => setScheduleInput(e.target.value)}
              placeholder={t('createTask.schedulePlaceholder')}
              className="w-full px-6 py-4.5 rounded-[20px] bg-surface-secondary/40 border border-border-light focus:bg-surface focus:border-accent/40 transition-all outline-none text-[15px] font-mono font-bold tracking-tight shadow-inner" />

            <div className="flex flex-wrap gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-quaternary self-center mr-1">{t('tasks.preset')}:</span>
              {presetExamples.map((p) => (
                <button key={p.value} onClick={() => setScheduleInput(p.value)}
                  className="px-3 py-1.5 rounded-[10px] bg-surface-secondary/30 border border-border-light text-[11px] font-bold text-text-tertiary hover:text-text hover:border-accent/30 transition-all">
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Skills */}
          <div className="space-y-3">
            <label className="flex items-center gap-3 text-[13px] font-bold uppercase tracking-[0.2em] text-text-tertiary ml-1 opacity-70">
              <BookOpen size={14} className="text-accent" /> {t('createTask.skillsLabel')}
            </label>
            <div className="flex flex-wrap gap-2">
              {skills.filter((s) => s.enabled).map((skill) => (
                <button key={skill.name} onClick={() => toggleSkill(skill.name)}
                  className={`px-4 py-2 rounded-[14px] text-[12px] font-bold tracking-tight transition-all border ${selectedSkills.includes(skill.name) ? 'bg-accent text-accent-foreground border-accent shadow-sm' : 'bg-surface-secondary/40 border-border-light text-text-tertiary hover:text-text hover:border-accent/30'}`}>
                  {skill.name}
                </button>
              ))}
              {skills.filter((s) => s.enabled).length === 0 && (
                <span className="text-[13px] text-text-quaternary italic">{t('createTask.noSkills')}</span>
              )}
            </div>
          </div>

          {/* Delivery */}
          <div className="space-y-3">
            <label className="flex items-center gap-3 text-[13px] font-bold uppercase tracking-[0.2em] text-text-tertiary ml-1 opacity-70">
              <Shield size={14} className="text-accent" /> {t('createTask.deliveryLabel')}
            </label>
            <div className="flex flex-wrap gap-3">
              {deliveryOptions.map((option) => (
                <button key={option.id} onClick={() => setDeliver(option.id)}
                  className={`px-6 py-2.5 rounded-[14px] text-[13px] font-bold tracking-tight transition-all border ${deliver === option.id ? 'bg-accent text-accent-foreground border-accent' : 'bg-surface-secondary/50 border-border-light text-text-tertiary hover:text-text'}`}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-red-500 text-[13px] font-bold">Error: {error}</p>}
        </div>

        {/* Footer */}
        <div className="px-12 py-10 bg-surface-secondary/30 backdrop-blur-2xl border-t border-border-light flex items-center justify-end gap-6 rounded-b-[40px]">
          <button onClick={onClose} className="px-10 py-4.5 rounded-[18px] text-[15px] font-bold text-text-secondary hover:bg-surface-secondary hover:text-text transition-all duration-300">
            {t('createTask.discard')}
          </button>
          <MagicButton onClick={handleSubmit} isDisabled={!name.trim() || !prompt.trim() || !scheduleInput.trim()} className="px-12 py-4.5 rounded-[18px] shadow-2xl shadow-accent/20">
            <span className="text-[15px] font-bold">{t('createTask.scheduleAutomation')}</span>
          </MagicButton>
        </div>
      </div>
    </div>
  );
}
