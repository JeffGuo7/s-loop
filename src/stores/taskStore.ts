import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ScheduledTask, TaskExecution, TaskFrequency, TaskStatus } from '../types/task';

interface TaskState {
  tasks: ScheduledTask[];
  executions: TaskExecution[];

  // Actions
  createTask: (task: Omit<ScheduledTask, 'id' | 'createdAt' | 'lastRun' | 'status' | 'nextRun'>) => ScheduledTask;
  updateTask: (id: string, updates: Partial<ScheduledTask>) => void;
  deleteTask: (id: string) => void;
  toggleTask: (id: string) => void;

  // Execution
  startExecution: (taskId: string) => TaskExecution;
  updateExecution: (id: string, updates: Partial<TaskExecution>) => void;
}

const generateId = () => Math.random().toString(36).substring(2, 15);

// Calculate next run time based on frequency
function calculateNextRun(frequency: TaskFrequency, scheduledTime: string): number {
  const now = Date.now();
  const scheduled = new Date(scheduledTime).getTime();

  if (frequency === 'once') {
    return scheduled;
  }

  // For recurring tasks, find next occurrence
  if (scheduled <= now) {
    switch (frequency) {
      case 'daily':
        return scheduled + 24 * 60 * 60 * 1000;
      case 'weekly':
        return scheduled + 7 * 24 * 60 * 60 * 1000;
      case 'monthly':
        const nextMonth = new Date(scheduled);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        return nextMonth.getTime();
      default:
        return scheduled;
    }
  }

  return scheduled;
}

export const useTaskStore = create<TaskState>()(
  persist(
    (set) => ({
      tasks: [],
      executions: [],

      createTask: (taskData) => {
        const id = generateId();
        const now = Date.now();
        const nextRun = calculateNextRun(taskData.frequency, taskData.scheduledTime);

        const newTask: ScheduledTask = {
          id,
          ...taskData,
          createdAt: now,
          lastRun: null,
          status: 'pending',
          nextRun,
        };

        set((state) => ({
          tasks: [...state.tasks, newTask],
        }));

        return newTask;
      },

      updateTask: (id, updates) => {
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === id ? { ...task, ...updates } : task
          ),
        }));
      },

      deleteTask: (id) => {
        set((state) => ({
          tasks: state.tasks.filter((task) => task.id !== id),
          executions: state.executions.filter((exec) => exec.taskId !== id),
        }));
      },

      toggleTask: (id) => {
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === id ? { ...task, enabled: !task.enabled } : task
          ),
        }));
      },

      startExecution: (taskId) => {
        const execId = generateId();
        const now = Date.now();

        const execution: TaskExecution = {
          id: execId,
          taskId,
          startTime: now,
          endTime: null,
          status: 'running',
          output: '',
        };

        set((state) => ({
          executions: [...state.executions, execution],
          tasks: state.tasks.map((task) =>
            task.id === taskId ? { ...task, status: 'running' } : task
          ),
        }));

        return execution;
      },

      updateExecution: (id, updates) => {
        set((state) => ({
          executions: state.executions.map((exec) =>
            exec.id === id ? { ...exec, ...updates } : exec
          ),
          tasks: state.tasks.map((task) => {
            const exec = state.executions.find((e) => e.id === id);
            if (exec && task.id === exec.taskId && updates.status) {
              return {
                ...task,
                status: updates.status as TaskStatus,
                lastRun: updates.endTime || Date.now(),
                nextRun: task.frequency !== 'once'
                  ? calculateNextRun(task.frequency, task.scheduledTime)
                  : task.nextRun,
              };
            }
            return task;
          }),
        }));
      },
    }),
    {
      name: 'snotra-task-storage',
      partialize: (state) => ({
        tasks: state.tasks,
        executions: state.executions.slice(-50), // Keep last 50 executions
      }),
    }
  )
);