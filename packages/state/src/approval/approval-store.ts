import type { ImmutableApprovalRequest } from '@ai-orchestrator/core';

export interface ApprovalStore {
  listByRunId: (runId: string) => Promise<readonly ImmutableApprovalRequest[]>;
  getById: (requestId: string) => Promise<ImmutableApprovalRequest | null>;
  append: (request: ImmutableApprovalRequest) => Promise<void>;
}
