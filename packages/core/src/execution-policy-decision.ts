export type ExecutionPolicyActionType = 'git_commit' | 'git_push' | 'pr_draft' | 'artifact_write' | 'external_api';
export type ExecutionPolicyRiskLevel = 'low' | 'medium' | 'high';
export type ExecutionPolicyDecisionResult = 'allow' | 'deny' | 'error';

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
