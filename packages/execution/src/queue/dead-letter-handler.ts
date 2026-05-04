import type { FailureRecord } from '../../../core/src/index.ts';
import { WorkflowPolicyError } from '../../../shared/src/index.ts';

export interface DeadLetterResult {
  failure: FailureRecord;
  changed: boolean;
}

export function ensureDeadLetteredFailure(failure: FailureRecord, nowIso: string): DeadLetterResult {
  const currentStatus = failure.status ?? 'retryable';
  if (currentStatus === 'dead_lettered') {
    return { failure, changed: false };
  }

  if (currentStatus === 'resumed' || currentStatus === 'replayed') {
    throw new WorkflowPolicyError(`Failure ${failure.id} cannot be dead-lettered from status ${currentStatus}`, {
      details: { failureId: failure.id, status: currentStatus, operation: 'dead_letter_failure' },
    });
  }

  failure.status = 'dead_lettered';
  failure.deadLetteredAt = nowIso;
  return { failure, changed: true };
}
