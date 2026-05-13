export type TaskFrequency = 'once' | 'daily' | 'weekly' | 'monthly';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  prompt: string;
  frequency: TaskFrequency;
  scheduledTime: string; // ISO time or cron-like
  nextRun: number; // timestamp
  lastRun: number | null;
  status: TaskStatus;
  createdAt: number;
  // Task settings
  workingDirectory?: string;
  model?: string;
  permissionMode: 'auto' | 'ask';
  enabled: boolean;
}

export interface TaskExecution {
  id: string;
  taskId: string;
  startTime: number;
  endTime: number | null;
  status: TaskStatus;
  output: string;
  error?: string;
}
