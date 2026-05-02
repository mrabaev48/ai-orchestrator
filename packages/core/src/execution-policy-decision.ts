import { z } from 'zod';

export const executionPolicyActionTypes = ['git_commit', 'git_push', 'pr_draft', 'artifact_write', 'external_api'] as const;
export type ExecutionPolicyActionType = (typeof executionPolicyActionTypes)[number];

export const executionPolicyRiskLevels = ['low', 'medium', 'high'] as const;
export type ExecutionPolicyRiskLevel = (typeof executionPolicyRiskLevels)[number];

export const executionPolicyDecisionResults = ['allow', 'deny', 'error'] as const;
export type ExecutionPolicyDecisionResult = (typeof executionPolicyDecisionResults)[number];

export interface ExecutionPolicyDecision {
  decisionId: string;
  tenantId: string;
  projectId: string;
  runId: string;
  stepId: string;
  attempt: number;
  actionType: ExecutionPolicyActionType;
  riskLevel: ExecutionPolicyRiskLevel;
  decision: ExecutionPolicyDecisionResult;
  reasonCodes: string[];
  decidedAt: string;
  decider: string;
  inputHash: string;
  traceId: string;
  policyVersion: string;
}

export const executionPolicyDecisionSchema = z.object({
  decisionId: z.string().min(1),
  tenantId: z.string().min(1),
  projectId: z.string().min(1),
  runId: z.string().min(1),
  stepId: z.string().min(1),
  attempt: z.number().int().nonnegative(),
  actionType: z.enum(executionPolicyActionTypes),
  riskLevel: z.enum(executionPolicyRiskLevels),
  decision: z.enum(executionPolicyDecisionResults),
  reasonCodes: z.array(z.string().min(1)),
  decidedAt: z.iso.datetime({ offset: true }),
  decider: z.string().min(1),
  inputHash: z.string().min(1),
  traceId: z.string().min(1),
  policyVersion: z.string().min(1),
}).superRefine((decision, ctx) => {
  if (decision.decision !== 'allow' && decision.reasonCodes.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ['reasonCodes'],
      message: 'reasonCodes must include at least one code when decision is deny or error',
    });
  }
});

export interface ExecutionPolicyDecisionValidationContext {
  tenantId?: string;
  projectId?: string;
  runId?: string;
}

export function validateExecutionPolicyDecision(
  decision: ExecutionPolicyDecision,
  context: ExecutionPolicyDecisionValidationContext = {},
): string[] {
  const parsed = executionPolicyDecisionSchema.safeParse(decision);
  const issues = parsed.success
    ? []
    : parsed.error.issues.map((issue) => {
      const path = issue.path.length === 0 ? 'executionPolicyDecision' : issue.path.join('.');
      return `${path}: ${issue.message}`;
    });

  if (context.tenantId != null && decision.tenantId !== context.tenantId) {
    issues.push('tenantId: decision tenantId does not match project state orgId');
  }
  if (context.projectId != null && decision.projectId !== context.projectId) {
    issues.push('projectId: decision projectId does not match project state projectId');
  }
  if (context.runId != null && decision.runId !== context.runId) {
    issues.push('runId: decision runId does not match execution activeRunId');
  }

  return issues;
}
