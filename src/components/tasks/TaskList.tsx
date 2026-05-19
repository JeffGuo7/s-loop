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
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="section-kicker mb-2">Automation Desk</p>
          <h1 className="section-heading">Scheduled Tasks</h1>
          <p className="text-sm text-(--color-text-secondary) mt-2">
            Automate AI tasks to run at specific times
          </p>
        </div>
        <button
          onClick={onCreateTask}
          className="btn btn-primary btn-lg gap-2"
        >
          <Plus size={18} />
          New Task
        </button>
      </div>

      {/* Task List */}
      {tasks.length === 0 ? (
        <div className="surface-panel-subtle text-center py-20 px-6">
          <Clock size={48} className="mx-auto mb-5 text-(--color-text-secondary) opacity-50" />
          <h3 className="text-lg font-semibold mb-2">No scheduled tasks</h3>
          <p className="text-sm text-(--color-text-secondary) mb-4">
            Create your first task to automate AI workflows
          </p>
          <button
            onClick={onCreateTask}
            className="btn btn-secondary"
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
                p-5 rounded-2xl border transition-all shadow-sm
                ${task.enabled
                  ? 'bg-(--color-surface) border-(--color-border)'
                  : 'bg-(--color-surface-secondary) border-(--color-border) opacity-60'
                }
              `}
            >
              <div className="flex items-center gap-4">
                {/* Enable/Disable Toggle */}
                <button
                  onClick={() => toggleTask(task.id)}
                  className={`
                    p-2.5 rounded-xl transition-colors
                    ${task.enabled
                      ? 'bg-(--color-accent)/10 text-(--color-accent)'
                      : 'bg-(--color-surface-secondary) text-(--color-text-secondary)'
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
                      badge badge-accent
                    `}>
                      {getFrequencyLabel(task)}
                    </span>
                  </div>
                  <p className="text-sm text-(--color-text-secondary) truncate mt-1">
                    {task.description || task.prompt.slice(0, 100)}
                  </p>
                </div>

                {/* Status & Next Run */}
                <div className="text-right">
                  <p className={`text-sm capitalize ${getStatusColor(task.status)}`}>
                    {task.status}
                  </p>
                  <p className="text-xs text-(--color-text-secondary) mt-1">
                    {formatNextRun(task.nextRun)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => deleteTask(task.id)}
                    className="p-2 rounded-lg hover:bg-(--color-surface-secondary) text-(--color-text-secondary) hover:text-(--color-error) transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                  <ChevronRight size={16} className="text-(--color-text-secondary)" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Notice */}
      {tasks.length > 0 && (
        <div className="mt-8 surface-panel-subtle p-4 border-(--color-warning)/20 bg-(--color-warning)/10">
          <div className="flex items-center gap-2 text-(--color-warning)">
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
