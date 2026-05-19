import { useTaskStore } from '../../stores';
import { Plus, Clock, Trash2, Play, Pause, ChevronRight, RefreshCw } from 'lucide-react';
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
        return 'text-[var(--color-accent)]';
      case 'completed':
        return 'text-[var(--color-success)]';
      case 'failed':
        return 'text-[var(--color-error)]';
      case 'cancelled':
        return 'text-[var(--color-text-tertiary)]';
      default:
        return 'text-[var(--color-text-secondary)]';
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Scheduled Tasks</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Automate AI tasks to run at specific times
          </p>
        </div>
        <button
          onClick={onCreateTask}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity"
        >
          <Plus size={18} />
          New Task
        </button>
      </div>

      {/* Task List */}
      {tasks.length === 0 ? (
        <div className="text-center py-12">
          <Clock size={48} className="mx-auto mb-4 text-[var(--color-text-secondary)] opacity-50" />
          <h3 className="text-lg font-medium mb-2">No scheduled tasks</h3>
          <p className="text-sm text-[var(--color-text-secondary)] mb-4">
            Create your first task to automate AI workflows
          </p>
          <button
            onClick={onCreateTask}
            className="text-[var(--color-accent)] hover:underline"
          >
            Create a task
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <div
              key={task.id}
              className={`
                p-4 rounded-lg border transition-all
                ${task.enabled
                  ? 'bg-[var(--color-surface)] border-[var(--color-border)]'
                  : 'bg-[var(--color-surface-secondary)] border-[var(--color-border)] opacity-60'
                }
              `}
            >
              <div className="flex items-center gap-4">
                {/* Enable/Disable Toggle */}
                <button
                  onClick={() => toggleTask(task.id)}
                  className={`
                    p-2 rounded-lg transition-colors
                    ${task.enabled
                      ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                      : 'bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)]'
                    }
                  `}
                >
                  {task.enabled ? <Play size={18} /> : <Pause size={18} />}
                </button>

                {/* Task Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium truncate">{task.name}</h3>
                    <span className={`
                      text-xs px-2 py-0.5 rounded-full
                      ${task.frequency === 'once'
                        ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                        : 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                      }
                    `}>
                      {getFrequencyLabel(task)}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--color-text-secondary)] truncate mt-1">
                    {task.description || task.prompt.slice(0, 100)}
                  </p>
                </div>

                {/* Status & Next Run */}
                <div className="text-right">
                  <p className={`text-sm capitalize ${getStatusColor(task.status)}`}>
                    {task.status}
                  </p>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                    {formatNextRun(task.nextRun)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="p-2 rounded-lg hover:bg-[var(--color-surface-secondary)] text-[var(--color-text-secondary)] hover:text-[var(--color-error)] transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                  <ChevronRight size={16} className="text-[var(--color-text-secondary)]" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Notice */}
      {tasks.length > 0 && (
        <div className="mt-6 p-4 rounded-lg bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/20">
          <div className="flex items-center gap-2 text-[var(--color-warning)]">
            <RefreshCw size={16} />
            <span className="text-sm">
              Tasks run while the application is open. Make sure Snotra is running at the scheduled time.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}