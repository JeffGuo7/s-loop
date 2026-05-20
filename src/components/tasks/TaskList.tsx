import { useTaskStore } from '../../stores';
import { Plus, Clock, Trash2, Play, Pause, RefreshCw } from 'lucide-react';
import { MagicButton } from '../ui';
import type { ScheduledTask } from '../../types/task';

interface TaskListProps {
  onCreateTask: () => void;
}

export function TaskList({ onCreateTask }: TaskListProps) {
  const { tasks, toggleTask, deleteTask } = useTaskStore();

  const formatNextRun = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = timestamp - now.getTime();

    if (diff < 0) return 'Overdue';
    if (diff < 60000) return 'In less than a minute';
    if (diff < 3600000) return `In ${Math.floor(diff / 60000)} minutes`;
    if (diff < 86400000) return `In ${Math.floor(diff / 3600000)} hours`;

    return date.toLocaleString();
  };

  const getFrequencyLabel = (task: ScheduledTask) => {
    switch (task.frequency) {
      case 'once':
        return 'Once';
      case 'daily':
        return 'Daily';
      case 'weekly':
        return 'Weekly';
      case 'monthly':
        return 'Monthly';
      default:
        return task.frequency;
    }
  };

  const getStatusColor = (status: ScheduledTask['status']) => {
    switch (status) {
      case 'running':
        return 'text-(--color-accent)';
      case 'completed':
        return 'text-(--color-success)';
      case 'failed':
        return 'text-(--color-error)';
      case 'cancelled':
        return 'text-(--color-text-tertiary)';
      default:
        return 'text-(--color-text-secondary)';
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-8 pt-8 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="section-kicker mb-2">Automation Desk</p>
            <h1 className="section-heading">Scheduled Tasks</h1>
            <p className="text-sm text-(--color-text-secondary) mt-2">
              Automate AI tasks to run at specific times
            </p>
          </div>
          <MagicButton
            onClick={onCreateTask}
            className="gap-2 shrink-0"
          >
            <Plus size={18} />
            New Task
          </MagicButton>
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {tasks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <div className="relative group mb-8">
              <div className="absolute inset-0 bg-(--color-accent) opacity-[0.04] blur-3xl rounded-full scale-150" />
              <div className="relative w-32 h-32 rounded-[40%_60%_55%_45%_/_50%_45%_55%_50%] bg-white/50 dark:bg-white/5 border border-(--color-border-light) flex items-center justify-center shadow-xl backdrop-blur-2xl overflow-hidden">
                <Clock size={52} className="text-(--color-text-secondary) opacity-40" />
              </div>
            </div>
            <h3 className="text-xl font-semibold mb-3 text-(--color-text)">No scheduled tasks</h3>
            <p className="text-sm text-(--color-text-tertiary) mb-8 max-w-xs text-center leading-relaxed">
              Create your first task to automate AI workflows and let Snotra handle the heavy lifting.
            </p>
            <button
              onClick={onCreateTask}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-(--color-accent) text-(--color-accent-foreground) font-medium text-sm shadow-lg shadow-(--color-accent)/20 hover:shadow-xl hover:shadow-(--color-accent)/30 hover:-translate-y-0.5 transition-all"
            >
              <Plus size={18} />
              Create a task
            </button>
          </div>
        ) : (
          <div className="max-w-4xl space-y-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={`
                  group flex items-center gap-4 p-4 rounded-2xl border transition-all duration-200
                  ${task.enabled
                    ? 'bg-(--color-surface) border-(--color-border) hover:border-(--color-border-hover) hover:shadow-md'
                    : 'bg-(--color-surface-secondary) border-(--color-border) opacity-60 hover:opacity-80'
                  }
                `}
              >
                {/* Status Indicator Dot */}
                <div className={`
                  w-2.5 h-2.5 rounded-full shrink-0
                  ${task.status === 'running' ? 'bg-(--color-accent) animate-pulse' : ''}
                  ${task.status === 'completed' ? 'bg-(--color-success)' : ''}
                  ${task.status === 'failed' ? 'bg-(--color-error)' : ''}
                  ${task.status === 'pending' ? 'bg-(--color-text-tertiary)' : ''}
                  ${task.status === 'cancelled' ? 'bg-(--color-text-quaternary)' : ''}
                `} />

                {/* Task Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-[15px] text-(--color-text) truncate">{task.name}</h3>
                    <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.08em] px-2.5 py-0.5 rounded-full bg-(--color-surface-secondary) border border-(--color-border-light) text-(--color-text-tertiary)">
                      {getFrequencyLabel(task)}
                    </span>
                  </div>
                  <p className="text-sm text-(--color-text-secondary) truncate mt-1 leading-relaxed">
                    {task.description || task.prompt.slice(0, 120)}
                  </p>
                </div>

                {/* Status & Time */}
                <div className="text-right shrink-0 hidden sm:block">
                  <p className={`text-sm font-medium capitalize ${getStatusColor(task.status)}`}>
                    {task.status}
                  </p>
                  <p className="text-xs text-(--color-text-tertiary) mt-0.5 whitespace-nowrap">
                    {formatNextRun(task.nextRun)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggleTask(task.id)}
                    className={`
                      p-2 rounded-xl transition-all duration-200
                      ${task.enabled
                        ? 'bg-(--color-accent)/10 text-(--color-accent) hover:bg-(--color-accent)/20'
                        : 'bg-(--color-surface-secondary) text-(--color-text-secondary) hover:bg-(--color-surface)'
                      }
                    `}
                  >
                    {task.enabled ? <Play size={15} /> : <Pause size={15} />}
                  </button>
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="p-2 rounded-xl hover:bg-(--color-error)/10 text-(--color-text-tertiary) hover:text-(--color-error) transition-all duration-200 opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Notice */}
        {tasks.length > 0 && (
          <div className="mt-6 max-w-4xl p-4 rounded-2xl bg-(--color-warning)/[0.06] border border-(--color-warning)/[0.12]">
            <div className="flex items-start gap-3">
              <RefreshCw size={16} className="mt-0.5 text-(--color-warning) shrink-0" />
              <span className="text-sm text-(--color-text-secondary) leading-relaxed">
                Tasks run while the application is open. Make sure Snotra is running at the scheduled time.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
