import type { FailureRecord } from '@ai-orchestrator/core';

import type { RecordFailureInput } from './StateStore.js';

export function buildFailureRecord(input: RecordFailureInput, createdAt = new Date().toISOString()): FailureRecord {
  return {
    id: crypto.randomUUID(),
    taskId: input.taskId,
    role: input.role,
    reason: input.reason,
    symptoms: input.symptoms ?? [],
    badPatterns: input.badPatterns ?? [],
    retrySuggested: input.retrySuggested ?? true,
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.checkpointRunId !== undefined ? { checkpointRunId: input.checkpointRunId } : {}),
    ...(input.checkpointStepId !== undefined ? { checkpointStepId: input.checkpointStepId } : {}),
    ...(input.deadLetteredAt !== undefined ? { deadLetteredAt: input.deadLetteredAt } : {}),
    createdAt,
  };
}
