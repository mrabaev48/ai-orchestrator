export interface RunCycleResult {
  runId: string;
  status: 'completed' | 'blocked' | 'idle';
  taskId?: string;
  stopReason?: string;
}

export interface RunCycleOptions {
  forcedTaskId?: string;
  abortSignal?: AbortSignal;
}

export type RunSingleTaskErrorReason =
  | 'invalid_task_id'
  | 'task_blocked'
  | 'task_done'
  | 'task_not_executable';
