import type { FailureRecord } from '@ai-orchestrator/core';

export interface DeadLetterReplayStore {
  findFailureById: (failureId: string) => Promise<FailureRecord | null>;
  saveFailure: (failure: FailureRecord) => Promise<void>;
}
