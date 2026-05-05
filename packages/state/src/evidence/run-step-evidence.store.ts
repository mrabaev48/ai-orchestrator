import type { RunStepLogEntry } from '@ai-orchestrator/core';
import type { StateStore } from '../StateStore.js';

export interface RunStepEvidenceStore {
  append: (entry: RunStepLogEntry) => Promise<void>;
}

export function createRunStepEvidenceStore(stateStore: StateStore): RunStepEvidenceStore {
  return {
    async append(entry: RunStepLogEntry): Promise<void> {
      await stateStore.recordRunStep(entry);
    },
  };
}
