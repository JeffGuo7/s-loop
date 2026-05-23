import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTaskStore, useAppStore } from '../../stores';
import { X, Clock, Cpu, Shield } from 'lucide-react';
import { MagicButton } from '../ui';
import type { TaskFrequency } from '../../types/task';

interface CreateTaskModalProps {
  onClose: () => void;
}

export function CreateTaskModal({ onClose }: CreateTaskModalProps) {
  const { t } = useTranslation();
  const { createTask } = useTaskStore();
  const { providerConfigs, activeProvider } = useAppStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');
  const [frequency, setFrequency] = useState<TaskFrequency>('once');
  const [scheduledTime, setScheduledTime] = useState('');
  const [workingDirectory] = useState('');
  const [permissionMode, setPermissionMode] = useState<'auto' | 'ask'>('ask');
  const [model, setModel] = useState(providerConfigs[activeProvider]?.model || '');

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
    <div className="modal-overlay p-8 sm:p-16">
      <div className="modal-content w-full max-w-3xl rounded-[40px] shadow-3xl">
        {/* Header */}
        <div className="modal-header px-12 pt-12 pb-8 border-b border-border-light">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-[0.4em] text-accent opacity-60 mb-3">{t('createTask.automation')}</p>
            <h2 className="text-3xl font-bold tracking-tighter text-text">{t('createTask.title')}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-4 rounded-[20px] bg-surface-secondary/50 text-text-tertiary hover:text-text hover:bg-surface-secondary hover:rotate-90 transition-all duration-500 shadow-sm border border-border-light"
          >
            <X size={22} />
          </button>
        </div>

        {/* Content */}
        <div className="modal-body px-12 py-10 space-y-10 overflow-y-auto max-h-[65vh] scrollbar-subtle">
          {/* Info Banner */}
          <div className="bg-accent-subtle/50 border border-accent/15 rounded-[24px] flex items-start gap-5 p-6 backdrop-blur-xl">
            <Clock size={20} className="text-accent mt-0.5 shrink-0" />
            <p className="text-[15px] text-text-secondary leading-relaxed font-medium">
              {t('createTask.info')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {/* Task Name */}
            <div className="space-y-3">
              <label className="text-[13px] font-bold uppercase tracking-[0.2em] text-text-tertiary ml-1 opacity-70">{t('createTask.taskName')}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('createTask.taskPlaceholder')}
                className="w-full px-6 py-4.5 rounded-[20px] bg-surface-secondary/40 border border-border-light focus:bg-surface focus:border-accent/40 focus:ring-[12px] focus:ring-accent-subtle transition-all outline-none text-[15px] font-bold tracking-tight shadow-inner"
              />
            </div>

            {/* Description */}
            <div className="space-y-3">
              <label className="text-[13px] font-bold uppercase tracking-[0.2em] text-text-tertiary ml-1 opacity-70">
                {t('createTask.description')} <span className="opacity-40 font-normal italic">{t('createTask.optional')}</span>
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('createTask.descPlaceholder')}
                className="w-full px-6 py-4.5 rounded-[20px] bg-surface-secondary/40 border border-border-light focus:bg-surface focus:border-accent/40 focus:ring-[12px] focus:ring-accent-subtle transition-all outline-none text-[15px] font-bold tracking-tight shadow-inner"
              />
            </div>
          </div>

          {/* Prompt */}
          <div className="space-y-3">
            <label className="text-[13px] font-bold uppercase tracking-[0.2em] text-text-tertiary ml-1 opacity-70">{t('createTask.promptInstruction')}</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('createTask.promptPlaceholder')}
              rows={5}
              className="w-full px-6 py-5 rounded-[24px] bg-surface-secondary/40 border border-border-light focus:bg-surface focus:border-accent/40 focus:ring-[12px] focus:ring-accent-subtle transition-all outline-none text-[15px] font-medium leading-relaxed shadow-inner resize-none scrollbar-subtle"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {/* Frequency */}
            <div className="space-y-3">
              <label className="text-[13px] font-bold uppercase tracking-[0.2em] text-text-tertiary ml-1 opacity-70">{t('createTask.frequency')}</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as TaskFrequency)}
                className="w-full px-6 py-4.5 rounded-[20px] bg-surface-secondary/40 border border-border-light focus:bg-surface focus:border-accent/40 transition-all outline-none text-[15px] font-bold tracking-tight shadow-inner appearance-none cursor-pointer"
              >
                <option value="once">{t('createTask.runOnce')}</option>
                <option value="daily">{t('createTask.dailyExecution')}</option>
                <option value="weekly">{t('createTask.weeklySchedule')}</option>
                <option value="monthly">{t('createTask.monthlyRoutine')}</option>
              </select>
            </div>

            {/* Time */}
            <div className="space-y-3">
              <label className="text-[13px] font-bold uppercase tracking-[0.2em] text-text-tertiary ml-1 opacity-70">{t('createTask.scheduledTime')}</label>
              <input
                type="datetime-local"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="w-full px-6 py-4.5 rounded-[20px] bg-surface-secondary/40 border border-border-light focus:bg-surface focus:border-accent/40 transition-all outline-none text-[15px] font-bold tracking-tight shadow-inner cursor-pointer"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {/* Model */}
            <div className="space-y-3">
              <label className="flex items-center gap-3 text-[13px] font-bold uppercase tracking-[0.2em] text-text-tertiary ml-1 opacity-70">
                <Cpu size={14} className="text-accent" />
                {t('createTask.inferenceModel')}
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full px-6 py-4.5 rounded-[20px] bg-surface-secondary/40 border border-border-light focus:bg-surface focus:border-accent/40 transition-all outline-none text-[15px] font-bold tracking-tight shadow-inner appearance-none cursor-pointer"
              >
                {Object.keys(providerConfigs).map(p => (
                  <option key={p} value={providerConfigs[p].model}>
                    {providerConfigs[p].model} ({p})
                  </option>
                ))}
              </select>
            </div>

            {/* Permission */}
            <div className="space-y-3">
              <label className="flex items-center gap-3 text-[13px] font-bold uppercase tracking-[0.2em] text-text-tertiary ml-1 opacity-70">
                <Shield size={14} className="text-accent" />
                {t('createTask.securityMode')}
              </label>
              <select
                value={permissionMode}
                onChange={(e) => setPermissionMode(e.target.value as 'auto' | 'ask')}
                className="w-full px-6 py-4.5 rounded-[20px] bg-surface-secondary/40 border border-border-light focus:bg-surface focus:border-accent/40 transition-all outline-none text-[15px] font-bold tracking-tight shadow-inner appearance-none cursor-pointer"
              >
                <option value="ask">{t('createTask.manualApproval')}</option>
                <option value="auto">{t('createTask.automatedExecution')}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-12 py-10 bg-surface-secondary/30 backdrop-blur-2xl border-t border-border-light flex items-center justify-end gap-6 rounded-b-[40px]">
          <button
            onClick={onClose}
            className="px-10 py-4.5 rounded-[18px] text-[15px] font-bold text-text-secondary hover:bg-surface-secondary hover:text-text transition-all duration-300"
          >
            {t('createTask.discard')}
          </button>
          <MagicButton
            onClick={handleSubmit}
            isDisabled={!name.trim() || !prompt.trim() || !scheduledTime}
            className="px-12 py-4.5 rounded-[18px] shadow-2xl shadow-accent/20"
          >
            <span className="text-[15px] font-bold">{t('createTask.scheduleAutomation')}</span>
          </MagicButton>
        </div>
      </div>
    </div>
  );
}
