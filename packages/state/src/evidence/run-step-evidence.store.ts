import type { RunStepLogEntry } from '../../../core/src/index.ts';
import type { StateStore } from '../StateStore.ts';

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
