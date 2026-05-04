import type { FailureRecord } from '../../../core/src/index.ts';

export interface DeadLetterReplayStore {
  findFailureById: (failureId: string) => Promise<FailureRecord | null>;
  saveFailure: (failure: FailureRecord) => Promise<void>;
}
