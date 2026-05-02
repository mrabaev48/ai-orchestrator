import type { ImmutableApprovalRequest } from '../../../core/src/approval/approval-request.ts';

export interface ApprovalStore {
  listByRunId: (runId: string) => Promise<readonly ImmutableApprovalRequest[]>;
  getById: (requestId: string) => Promise<ImmutableApprovalRequest | null>;
  append: (request: ImmutableApprovalRequest) => Promise<void>;
}
