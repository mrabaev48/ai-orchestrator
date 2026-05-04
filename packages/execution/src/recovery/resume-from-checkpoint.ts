import { WorkflowPolicyError } from '../../../shared/src/index.ts';
import type { RecoveryCheckpointStore } from '../../../state/src/recovery/recovery-checkpoint.store.ts';

export interface ResumeFromCheckpointInput {
  taskId: string;
  requestedBy: string;
  reason?: string;
}

export interface ResumePointer {
  runId: string;
  stepId: string;
  nextAttempt: number;
  traceId: string;
  idempotencyKey: string;
}

export async function resumeFromCheckpoint(
  store: RecoveryCheckpointStore,
  input: ResumeFromCheckpointInput,
): Promise<ResumePointer> {
  const checkpoint = await store.getLatestByTaskId(input.taskId);
  if (!checkpoint) {
    throw new WorkflowPolicyError('Recovery checkpoint was not found for task resume', {
      details: { operation: 'resume_from_checkpoint', taskId: input.taskId, requestedBy: input.requestedBy },
    });
  }

  return {
    runId: checkpoint.runId,
    stepId: checkpoint.stepId,
    nextAttempt: checkpoint.attempt + 1,
    traceId: checkpoint.traceId,
    idempotencyKey: `${checkpoint.idempotencyKey}:resume:${checkpoint.attempt + 1}`,
  };
}
