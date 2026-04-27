export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'resumed' | 'completed';

export type ApprovalRequestedAction =
  | 'git_push'
  | 'pr_draft'
  | 'db_migration'
  | 'file_delete'
  | 'api_breaking_change'
  | 'dependency_bump'
  | 'security_auth_change'
  | 'production_config_change'
  | 'bulk_file_change';

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
