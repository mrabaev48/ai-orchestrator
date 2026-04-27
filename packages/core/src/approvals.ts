export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'resumed' | 'completed';

export type ApprovalRequestedAction = 'git_push' | 'pr_draft';

export interface ApprovalRequest {
  id: string;
  runId: string;
  taskId: string;
  reason: string;
  requestedAction: ApprovalRequestedAction;
  riskLevel: 'medium' | 'high';
  status: ApprovalStatus;
  metadata: Record<string, string>;
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  rejectionReason?: string;
  resumedAt?: string;
  resumedBy?: string;
  completedAt?: string;
}
