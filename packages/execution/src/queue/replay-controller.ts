import type { FailureRecord } from '../../../core/src/index.ts';
import { WorkflowPolicyError } from '../../../shared/src/index.ts';

export interface ReplaySelection {
  taskId: string;
  runId?: string;
}

export function assertReplayableFailure(failure: FailureRecord): void {
  const status = failure.status ?? 'retryable';
  if (status !== 'dead_lettered') {
    throw new WorkflowPolicyError(`Failure ${failure.id} is not dead-lettered`, {
      details: { failureId: failure.id, status, operation: 'replay_failure' },
    });
  }
}

export function selectReplayCheckpoint(failure: FailureRecord): ReplaySelection {
  assertReplayableFailure(failure);
  return {
    taskId: failure.taskId,
    ...(failure.checkpointRunId ? { runId: failure.checkpointRunId } : {}),
  };
}
