import type { AgentRoleName } from './roles.ts';

export type FailureStatus = 'retryable' | 'dead_lettered' | 'resumed' | 'replayed';

export interface FailureRecord {
  id: string;
  taskId: string;
  role: AgentRoleName;
  reason: string;
  symptoms: string[];
  badPatterns: string[];
  retrySuggested: boolean;
  status?: FailureStatus;
  checkpointRunId?: string;
  checkpointStepId?: string;
  deadLetteredAt?: string;
  resumedAt?: string;
  replayedAt?: string;
  createdAt: string;
}

export function toRetryConstraints(failures: FailureRecord[]): string[] {
  return failures.flatMap((failure) => [
    `Avoid repeat of failure reason: ${failure.reason}`,
    ...failure.badPatterns.map((pattern) => `Do not repeat bad pattern: ${pattern}`),
  ]);
}
