import type { ToolExecutionRecord, ToolEvidenceStore } from '../contracts.ts';

export interface EvidenceToolAdapter {
  store: ToolEvidenceStore;
}

export function createEvidenceToolAdapter(): EvidenceToolAdapter {
  const records: ToolExecutionRecord[] = [];

  return {
    store: {
      add: (record) => {
        records.push(record);
      },
      list: () => [...records],
    },
  };
}
