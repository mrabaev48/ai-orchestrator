import type { RunStepLogEntry } from '@ai-orchestrator/core';
import type { StateMutationResult, StateStore } from '../StateStore.js';

export interface RunStepEvidenceStore {
  append: (entry: RunStepLogEntry) => Promise<StateMutationResult>;
}

export function createRunStepEvidenceStore(stateStore: StateStore): RunStepEvidenceStore {
  return {
    async append(entry: RunStepLogEntry): Promise<StateMutationResult> {
      return await stateStore.recordRunStep(entry);
    },
  };
}
