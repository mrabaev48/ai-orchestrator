import { z } from 'zod';

import type { ApprovalRequestedAction, ApprovalStatus } from '../approvals.ts';

export interface ImmutableApprovalRequest {
  readonly id: string;
  readonly runId: string;
  readonly taskId: string;
  readonly reason: string;
  readonly requestedAction: ApprovalRequestedAction;
  readonly riskLevel: 'medium' | 'high';
  readonly status: ApprovalStatus;
  readonly metadata: Readonly<Record<string, string>>;
  readonly createdAt: string;
  readonly approvedAt?: string;
  readonly approvedBy?: string;
  readonly rejectedAt?: string;
  readonly rejectedBy?: string;
  readonly rejectionReason?: string;
  readonly resumedAt?: string;
  readonly resumedBy?: string;
  readonly completedAt?: string;
}

export const immutableApprovalRequestSchema = z
  .object({
    id: z.string().min(1),
    runId: z.string().min(1),
    taskId: z.string().min(1),
    reason: z.string().min(1),
    requestedAction: z.enum([
      'git_push',
      'pr_draft',
      'db_migration',
      'file_delete',
      'api_breaking_change',
      'dependency_bump',
      'security_auth_change',
      'production_config_change',
      'bulk_file_change',
    ]),
    riskLevel: z.enum(['medium', 'high']),
    status: z.enum(['pending', 'approved', 'rejected', 'resumed', 'completed']),
    metadata: z.record(z.string(), z.string()),
    createdAt: z.iso.datetime({ offset: true }),
    approvedAt: z.iso.datetime({ offset: true }).optional(),
    approvedBy: z.string().min(1).optional(),
    rejectedAt: z.iso.datetime({ offset: true }).optional(),
    rejectedBy: z.string().min(1).optional(),
    rejectionReason: z.string().min(1).optional(),
    resumedAt: z.iso.datetime({ offset: true }).optional(),
    resumedBy: z.string().min(1).optional(),
    completedAt: z.iso.datetime({ offset: true }).optional(),
  })
  .superRefine((value, context) => {
    if (value.status === 'approved' && (!value.approvedAt || !value.approvedBy)) {
      context.addIssue({ code: "custom", message: 'approved status requires approvedAt and approvedBy' });
    }
    if (value.status === 'rejected' && (!value.rejectedAt || !value.rejectedBy || !value.rejectionReason)) {
      context.addIssue({
        code: "custom",
        message: 'rejected status requires rejectedAt, rejectedBy and rejectionReason',
      });
    }
    if (value.status === 'resumed' && (!value.resumedAt || !value.resumedBy)) {
      context.addIssue({ code: "custom", message: 'resumed status requires resumedAt and resumedBy' });
    }
    if (value.status === 'completed' && !value.completedAt) {
      context.addIssue({ code: "custom", message: 'completed status requires completedAt' });
    }
  });

export function createImmutableApprovalRequest(input: ImmutableApprovalRequest): ImmutableApprovalRequest {
  const parsed = immutableApprovalRequestSchema.parse(input);
  const normalized: ImmutableApprovalRequest = {
    id: parsed.id,
    runId: parsed.runId,
    taskId: parsed.taskId,
    reason: parsed.reason,
    requestedAction: parsed.requestedAction,
    riskLevel: parsed.riskLevel,
    status: parsed.status,
    metadata: Object.freeze({ ...parsed.metadata }),
    createdAt: parsed.createdAt,
    ...(parsed.approvedAt ? { approvedAt: parsed.approvedAt } : {}),
    ...(parsed.approvedBy ? { approvedBy: parsed.approvedBy } : {}),
    ...(parsed.rejectedAt ? { rejectedAt: parsed.rejectedAt } : {}),
    ...(parsed.rejectedBy ? { rejectedBy: parsed.rejectedBy } : {}),
    ...(parsed.rejectionReason ? { rejectionReason: parsed.rejectionReason } : {}),
    ...(parsed.resumedAt ? { resumedAt: parsed.resumedAt } : {}),
    ...(parsed.resumedBy ? { resumedBy: parsed.resumedBy } : {}),
    ...(parsed.completedAt ? { completedAt: parsed.completedAt } : {}),
  };
  return Object.freeze(normalized);
}
