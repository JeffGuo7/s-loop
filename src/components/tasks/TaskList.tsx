import { useTranslation } from 'react-i18next';
import { useTaskStore } from '../../stores';
import { Plus, Clock, Trash2, Play, Pause, RefreshCw, Zap, FileText } from 'lucide-react';
import { useState } from 'react';
import { MagicButton } from '../ui';
import type { ScheduledTask } from '../../types/task';

interface TaskListProps {
  onCreateTask: () => void;
}

export function TaskList({ onCreateTask }: TaskListProps) {
  const { t } = useTranslation();
  const { tasks, toggleTask, removeTask, triggerRun, fetchOutput } = useTaskStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [outputCache, setOutputCache] = useState<Record<string, { timestamp: string; content: string; file?: string }[]>>({});
  const [loadingOutputId, setLoadingOutputId] = useState<string | null>(null);

  const formatNextRun = (timestamp: number | null) => {
    if (!timestamp) return t('tasks.completed');
    const date = new Date(timestamp);
    const now = new Date();
    const diff = timestamp - now.getTime();

    if (diff < 0) return t('tasks.overdue');
    if (diff < 60000) return t('tasks.inMinute');
    if (diff < 3600000) return t('tasks.inMinutes', { n: Math.floor(diff / 60000) });
    if (diff < 86400000) return t('tasks.inHours', { n: Math.floor(diff / 3600000) });

    return date.toLocaleString();
  };

  const getStatusColor = (status: ScheduledTask['lastStatus']) => {
    switch (status) {
      case 'running':
        return 'text-accent';
      case 'completed':
        return 'text-green-500';
      case 'failed':
        return 'text-red-500';
      case 'cancelled':
        return 'text-text-tertiary';
      default:
        return 'text-text-secondary';
    }
  };

  const toggleOutputs = async (taskId: string) => {
    if (expandedId === taskId) {
      setExpandedId(null);
      return;
    }

    setExpandedId(taskId);
    if (outputCache[taskId]) return;

    setLoadingOutputId(taskId);
    try {
      const outputs = await fetchOutput(taskId);
      setOutputCache((prev) => ({ ...prev, [taskId]: outputs }));
    } finally {
      setLoadingOutputId((current) => (current === taskId ? null : current));
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-bg">
      {/* Header */}
      <div className="shrink-0 px-12 pt-16 pb-10">
        <div className="flex items-center justify-between gap-10">
          <div className="space-y-4">
            <p className="text-[12px] font-bold uppercase tracking-[0.4em] text-accent opacity-50">{t('tasks.automationDesk')}</p>
            <h1 className="text-6xl font-bold tracking-tight text-text leading-none drop-shadow-sm">{t('tasks.scheduledTasks')}</h1>
            <p className="text-[16px] text-text-tertiary font-medium opacity-70 max-w-2xl leading-relaxed">
              {t('tasks.description')}
            </p>
          </div>
          <MagicButton
            onClick={onCreateTask}
            className="gap-3 shrink-0 px-6 py-3 rounded-xl shadow-md shadow-accent/10 hover:shadow-accent/25 transition-all duration-500 hover:-translate-y-0.5 group"
          >
            <Plus size={18} strokeWidth={3} className="group-hover:rotate-90 transition-transform duration-500" />
            <span className="font-bold text-[15px] tracking-tight">{t('tasks.newTask')}</span>
          </MagicButton>
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto px-12 pb-12 scrollbar-subtle">
        {tasks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center py-32">
            <div className="relative group mb-12">
              <div className="absolute inset-0 bg-accent opacity-20 blur-[120px] rounded-full scale-150 group-hover:opacity-30 transition-opacity duration-1000" />
              <div className="relative w-40 h-40 rounded-[40%_60%_60%_40%/40%_40%_60%_60%] bg-white/90 dark:bg-white/5 border border-white/50 dark:border-white/10 flex items-center justify-center shadow-4xl backdrop-blur-3xl animate-float overflow-hidden">
                <Clock size={80} className="text-accent opacity-40 drop-shadow-[0_0_24px_rgba(var(--color-accent-rgb),0.5)]" />
                <div className="absolute inset-0 bg-linear-to-tr from-transparent via-white/40 to-transparent -translate-x-full animate-[shimmer_4s_infinite]" />
              </div>
            </div>
            <h3 className="text-4xl font-bold mb-6 text-text tracking-tighter">{t('tasks.emptyTitle')}</h3>
            <p className="text-[16px] text-text-tertiary mb-12 max-w-lg text-center leading-relaxed font-bold opacity-60">
              {t('tasks.emptyDesc')}
            </p>
            <button
              onClick={onCreateTask}
              className="inline-flex items-center gap-6 px-12 py-5 rounded-[28px] bg-accent text-accent-foreground font-extrabold text-xl shadow-3xl shadow-accent/20 hover:shadow-accent/40 hover:-translate-y-1.5 transition-all duration-700 group"
            >
              <Plus size={24} strokeWidth={3} className="group-hover:rotate-90 transition-transform duration-500" />
              {t('tasks.createFirst')}
            </button>
          </div>
        ) : (
          <div className="max-w-6xl space-y-6">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={`
                  group rounded-[32px] border transition-all duration-700 overflow-hidden
                  ${task.enabled
                    ? 'bg-surface border-border hover:border-accent/25 hover:shadow-3xl hover:shadow-accent/10 hover:-translate-y-1.5'
                    : 'bg-surface-secondary/60 border-border-light opacity-50 hover:opacity-80'
                  }
                `}
              >
                <div className="flex items-center gap-8 p-6">
                {/* Status Indicator Dot */}
                <div className="relative flex items-center justify-center shrink-0 ml-4">
                  <div className={`
                    w-4 h-4 rounded-full relative z-10
                    ${task.lastStatus === 'running' ? 'bg-accent animate-pulse shadow-[0_0_16px_var(--color-accent)]' : ''}
                    ${task.lastStatus === 'completed' ? 'bg-green-500 shadow-[0_0_16px_rgba(34,197,94,0.7)]' : ''}
                    ${task.lastStatus === 'failed' ? 'bg-red-500 shadow-[0_0_16px_rgba(200,48,48,0.7)]' : ''}
                    ${task.lastStatus === 'pending' ? 'bg-text-tertiary opacity-40' : ''}
                    ${task.lastStatus === 'cancelled' ? 'bg-text-quaternary opacity-30' : ''}
                  `} />
                  {task.lastStatus === 'running' && (
                    <div className="absolute inset-0 bg-accent/40 rounded-full animate-ping scale-150" />
                  )}
                </div>

                {/* Task Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-6">
                    <h3 className="font-bold text-2xl text-text truncate tracking-tighter">{task.name}</h3>
                    <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.2em] px-5 py-1.5 rounded-full bg-accent-subtle text-accent border border-accent/15 shadow-sm">
                      {task.schedule.display}
                    </span>
                    {task.deliver === 'chat' && task.deliverSessionId && (
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.2em] px-4 py-1.5 rounded-full bg-green-500/10 text-green-500 border border-green-500/15">
                        Chat
                      </span>
                    )}
                  </div>
                  <p className="text-[14px] text-text-tertiary truncate mt-2 leading-relaxed font-bold opacity-70">
                    {task.prompt.slice(0, 100)}
                  </p>
                  {(task.deliveredRunId || task.deliveryError) && (
                    <p className={`text-[12px] mt-3 font-bold ${task.deliveryError ? 'text-red-500' : 'text-green-500/80'}`}>
                      {task.deliveryError ? `投递失败: ${task.deliveryError}` : '已投递到聊天'}
                    </p>
                  )}
                </div>

                {/* Status & Time */}
                <div className="text-right shrink-0 hidden lg:block px-6">
                  <p className={`text-[13px] font-bold uppercase tracking-[0.3em] ${getStatusColor(task.lastStatus)}`}>
                    {t(`tasks.${task.lastStatus}`)}
                  </p>
                  <p className="text-[12px] text-text-quaternary mt-2 whitespace-nowrap font-bold opacity-50">
                    {formatNextRun(task.nextRunAt)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-4 shrink-0 pr-4">
                  <button
                    onClick={() => toggleOutputs(task.id)}
                    className="p-4 rounded-[16px] hover:bg-accent/10 text-text-quaternary hover:text-accent transition-all duration-500"
                    title="View outputs"
                  >
                    <FileText size={20} />
                  </button>
                  <button
                    onClick={() => toggleTask(task.id)}
                    className={`
                      p-4 rounded-[16px] transition-all duration-500
                      ${task.enabled
                        ? 'bg-accent/10 text-accent hover:bg-accent hover:text-accent-foreground shadow-sm'
                        : 'bg-surface-tertiary text-text-tertiary hover:bg-surface hover:text-text-secondary'
                      }
                    `}
                  >
                    {task.enabled ? <Pause size={20} /> : <Play size={20} />}
                  </button>
                  <button
                    onClick={() => triggerRun(task.id)}
                    className="p-4 rounded-[16px] hover:bg-green-500/10 text-text-quaternary hover:text-green-500 transition-all duration-500 opacity-0 group-hover:opacity-100 scale-90 hover:scale-100"
                    title="Run now"
                  >
                    <Zap size={20} />
                  </button>
                  <button
                    onClick={() => removeTask(task.id)}
                    className="p-4 rounded-[16px] hover:bg-red-500/10 text-text-quaternary hover:text-red-500 transition-all duration-700 opacity-0 group-hover:opacity-100 scale-90 hover:scale-100"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
                </div>

                {expandedId === task.id && (
                  <div className="border-t border-border-light px-8 py-6 bg-surface-secondary/30">
                    {loadingOutputId === task.id ? (
                      <p className="text-[13px] font-bold text-text-tertiary opacity-70">正在加载任务输出...</p>
                    ) : (outputCache[task.id]?.length ?? 0) === 0 ? (
                      <p className="text-[13px] font-bold text-text-tertiary opacity-70">还没有可查看的执行输出。</p>
                    ) : (
                      <div className="space-y-4">
                        {outputCache[task.id].map((output) => (
                          <div key={output.file || output.timestamp} className="rounded-[20px] border border-border-light bg-surface p-5">
                            <div className="flex items-center justify-between gap-4 mb-3">
                              <p className="text-[12px] font-bold uppercase tracking-[0.25em] text-accent">
                                {output.timestamp}
                              </p>
                              {output.file && (
                                <span className="text-[11px] text-text-quaternary font-mono">{output.file}</span>
                              )}
                            </div>
                            <pre className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-text-secondary font-mono max-h-80 overflow-auto scrollbar-subtle">
                              {output.content}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Notice */}
        {tasks.length > 0 && (
          <div className="mt-16 max-w-6xl p-8 rounded-[32px] bg-accent-subtle border border-accent/15 backdrop-blur-3xl shadow-[0_16px_64px_rgba(var(--color-accent-rgb),0.08)]">
            <div className="flex items-start gap-8">
              <RefreshCw size={24} className="mt-1 text-accent shrink-0 animate-spin-slow opacity-50" />
              <div className="space-y-3">
                <p className="text-[13px] font-bold text-accent uppercase tracking-[0.4em]">{t('tasks.engineStatus')}</p>
                <p className="text-[15px] text-text-tertiary leading-relaxed font-bold opacity-60">
                  {t('tasks.engineNotice')}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
