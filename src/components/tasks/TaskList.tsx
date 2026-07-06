import { useTranslation } from 'react-i18next';
import { useTaskStore } from '../../stores';
import { Plus, Trash2, Play, Pause, Zap, Search, Calendar, Eye } from 'lucide-react';
import { useState, useMemo } from 'react';
import { MagicButton } from '../ui';
import { TaskDetailModal } from './TaskDetailModal';
import type { ScheduledTask } from '../../types/task';
import { PLATFORM_PRESETS } from '../../types/platform';

interface TaskListProps {
  onCreateTask: () => void;
}

function formatNextRun(timestamp: number | null, t: ReturnType<typeof useTranslation>['t']): string {
  if (!timestamp) return '—';
  const diff = timestamp - Date.now();
  if (diff < 0) return t('tasks.overdue');
  if (diff < 60000) return t('tasks.inMinute');
  if (diff < 3600000) return t('tasks.inMinutes', { n: Math.floor(diff / 60000) });
  if (diff < 86400000) return t('tasks.inHours', { n: Math.floor(diff / 3600000) });
  return new Date(timestamp).toLocaleString();
}

function statusDot(status: ScheduledTask['lastStatus']) {
  const base = 'shrink-0 w-2 h-2 rounded-full';
  switch (status) {
    case 'running': return `${base} bg-accent animate-pulse`;
    case 'completed': return `${base} bg-green-500`;
    case 'failed': return `${base} bg-red-500`;
    default: return `${base} bg-text-tertiary/30`;
  }
}

const DELIVER_CHAT = 'chat';
const DELIVER_SILENT = 'silent';

export function TaskList({ onCreateTask }: TaskListProps) {
  const { t } = useTranslation();
  const { tasks, toggleTask, removeTask, triggerRun } = useTaskStore();
  const [detailTask, setDetailTask] = useState<ScheduledTask | null>(null);
  const [query, setQuery] = useState('');
  const platformNameMap = Object.fromEntries(PLATFORM_PRESETS.map((p) => [p.id, p.name]));

  const filtered = useMemo(() => {
    if (!query.trim()) return tasks;
    const q = query.toLowerCase();
    return tasks.filter((t) =>
      t.name.toLowerCase().includes(q) || t.prompt.toLowerCase().includes(q)
    );
  }, [tasks, query]);

  const deliverLabel = (d: string) => {
    if (d === DELIVER_CHAT) return t('tasks.deliverChat');
    if (d === DELIVER_SILENT) return '';
    return platformNameMap[d] || d;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-bg">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10 pb-4 sm:pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">{t('tasks.title')}</h1>
          <p className="text-[12px] text-text-tertiary mt-0.5">{t('tasks.description')}</p>
        </div>
        <MagicButton onClick={onCreateTask} className="gap-2 px-4 py-2 rounded-xl shadow shadow-accent/10 hover:shadow-accent/20 group">
          <Plus size={15} strokeWidth={2.5} className="group-hover:rotate-90 transition-transform duration-300" />
          <span className="font-bold text-[13px]">{t('tasks.newTask')}</span>
        </MagicButton>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 pb-12 scrollbar-subtle">
        {tasks.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-center">
            <div className="relative mb-8">
              <div className="absolute inset-0 bg-accent/10 blur-[80px] rounded-full scale-150" />
              <div className="relative w-28 h-28 rounded-[32px] bg-white dark:bg-surface border border-border-light flex items-center justify-center shadow-lg shadow-accent/5">
                <Calendar size={44} className="text-accent/50" strokeWidth={1.5} />
              </div>
            </div>
            <h3 className="text-xl font-bold text-text mb-2">{t('tasks.emptyTitle')}</h3>
            <p className="text-[14px] text-text-tertiary max-w-sm leading-relaxed">{t('tasks.emptyDesc')}</p>
            <button
              onClick={onCreateTask}
              className="mt-8 inline-flex items-center gap-2.5 px-7 py-3 rounded-2xl bg-accent text-white text-[14px] font-bold shadow-xl shadow-accent/20 hover:shadow-accent/40 hover:-translate-y-0.5 transition-all duration-300"
            >
              <Plus size={17} strokeWidth={2.5} />
              {t('tasks.createFirst')}
            </button>
          </div>
        ) : (
          <>
            {tasks.length > 5 && (
              <div className="mb-4 relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-quaternary" />
                <input
                  type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('tasks.filterPlaceholder')}
                  className="w-full pl-8 pr-3 py-2 rounded-lg bg-surface-secondary/50 border border-border-light text-[12px] text-text placeholder:text-text-quaternary outline-none focus:border-accent/30"
                />
              </div>
            )}

            <div className="space-y-1">
              {filtered.map((task) => {
                const dl = deliverLabel(task.deliver);
                return (
                  <div
                    key={task.id}
                    className={`group rounded-xl border transition-colors ${
                      task.enabled
                        ? 'bg-surface border-border hover:border-accent/20'
                        : 'bg-surface-secondary/50 border-border-light opacity-50 hover:opacity-75'
                    }`}
                  >
                    <div className="flex items-center gap-3 px-4 py-2.5">
                      <div className={statusDot(task.lastStatus)} />
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <span className="text-[13px] font-semibold text-text truncate">{task.name}</span>
                        <span className="shrink-0 text-[10px] text-text-tertiary bg-surface-secondary/70 px-2 py-0.5 rounded-md font-medium">
                          {task.schedule.display}
                        </span>
                        {dl && (
                          <span className="shrink-0 text-[10px] text-text-quaternary">{dl}</span>
                        )}
                      </div>
                      <span className="shrink-0 text-[10px] text-text-quaternary tabular-nums hidden md:block">
                        {formatNextRun(task.nextRunAt, t)}
                      </span>
                      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setDetailTask(task)} className="p-1.5 rounded-md hover:bg-accent/10 text-text-quaternary hover:text-accent" title={t('tasks.history')}>
                          <Eye size={13} />
                        </button>
                        <button onClick={() => toggleTask(task.id)}
                          className={`p-1.5 rounded-md ${task.enabled ? 'text-text-tertiary hover:text-text' : 'text-text-quaternary hover:text-accent'} hover:bg-surface-secondary`}>
                          {task.enabled ? <Pause size={13} /> : <Play size={13} />}
                        </button>
                        <button onClick={() => triggerRun(task.id)} className="p-1.5 rounded-md hover:bg-green-500/10 text-text-quaternary hover:text-green-500" title={t('tasks.runNow')}>
                          <Zap size={13} />
                        </button>
                        <button onClick={() => removeTask(task.id)} className="p-1.5 rounded-md hover:bg-red-500/10 text-text-quaternary hover:text-red-500">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {detailTask && <TaskDetailModal task={detailTask} onClose={() => setDetailTask(null)} />}
    </div>
  );
}
