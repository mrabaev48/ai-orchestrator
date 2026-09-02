import type { ApprovalRequestedAction } from './config/project-config.js';

export type { ApprovalRequestedAction };

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'resumed' | 'completed';

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
  /**
   * Политическое решение, на основании которого был зафиксирован outcome approval.
   * Нужен для audit и детерминированной реконструкции decision flow.
   */
  decisionPolicyDecisionId?: string;
  /**
   * Ссылка на evidence-запись (run-step/artifact/event) для связки outcome с исполнением.
   */
  decisionEvidenceId?: string;
}
