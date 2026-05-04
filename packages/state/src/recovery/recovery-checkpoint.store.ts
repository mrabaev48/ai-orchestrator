import type { RunStepLogEntry } from '../../../core/src/index.ts';
import type { StateStore } from '../StateStore.ts';

export interface RecoveryCheckpoint {
  readonly taskId: string;
  readonly runId: string;
  readonly stepId: string;
  readonly attempt: number;
  readonly idempotencyKey: string;
  readonly traceId: string;
  readonly createdAt: string;
  readonly reason: 'failed' | 'timed_out' | 'cancelled';
}

export interface RecoveryCheckpointStore {
  persist: (entry: RunStepLogEntry) => Promise<RecoveryCheckpoint | null>;
  getLatestByTaskId: (taskId: string) => Promise<RecoveryCheckpoint | null>;
}

const RECOVERY_STATUSES = new Set<RunStepLogEntry['status']>(['failed', 'timed_out', 'cancelled']);

export function createRecoveryCheckpointStore(stateStore: StateStore): RecoveryCheckpointStore {
  return {
    async persist(entry: RunStepLogEntry): Promise<RecoveryCheckpoint | null> {
      if (!entry.taskId || !RECOVERY_STATUSES.has(entry.status)) {
        return null;
      }

      return {
        taskId: entry.taskId,
        runId: entry.runId,
        stepId: entry.stepId,
        attempt: entry.attempt,
        idempotencyKey: entry.idempotencyKey,
        traceId: entry.traceId,
        createdAt: entry.createdAt,
        reason: entry.status as RecoveryCheckpoint['reason'],
      };
    },
    async getLatestByTaskId(taskId: string): Promise<RecoveryCheckpoint | null> {
      const steps = await stateStore.listRunSteps({ taskId, limit: 200 });
      const candidate = steps
        .filter((entry) => RECOVERY_STATUSES.has(entry.status) && entry.taskId === taskId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];

      if (!candidate?.taskId) {
        return null;
      }

      return {
        taskId: candidate.taskId,
        runId: candidate.runId,
        stepId: candidate.stepId,
        attempt: candidate.attempt,
        idempotencyKey: candidate.idempotencyKey,
        traceId: candidate.traceId,
        createdAt: candidate.createdAt,
        reason: candidate.status as RecoveryCheckpoint['reason'],
      };
    },
  };
}
