import type { ApprovalRequestedAction } from '../approvals.ts';
import type { ExecutionPolicyActionType, ExecutionPolicyRiskLevel } from '../execution-policy-decision.ts';

export const riskOwnershipTeams = ['orchestration', 'release', 'security', 'platform'] as const;
export type RiskOwnershipTeam = (typeof riskOwnershipTeams)[number];

export interface ActionRiskClassification<TAction extends string> {
  action: TAction;
  riskLevel: ExecutionPolicyRiskLevel;
  owner: RiskOwnershipTeam;
}

const EXECUTION_POLICY_RISK_MATRIX: Record<ExecutionPolicyActionType, ActionRiskClassification<ExecutionPolicyActionType>> = {
  artifact_write: { action: 'artifact_write', riskLevel: 'low', owner: 'orchestration' },
  external_api: { action: 'external_api', riskLevel: 'high', owner: 'security' },
  git_commit: { action: 'git_commit', riskLevel: 'medium', owner: 'release' },
  git_push: { action: 'git_push', riskLevel: 'high', owner: 'release' },
  pr_draft: { action: 'pr_draft', riskLevel: 'high', owner: 'release' },
};

const APPROVAL_REQUEST_RISK_MATRIX: Record<ApprovalRequestedAction, ActionRiskClassification<ApprovalRequestedAction>> = {
  git_push: { action: 'git_push', riskLevel: 'high', owner: 'release' },
  pr_draft: { action: 'pr_draft', riskLevel: 'high', owner: 'release' },
  db_migration: { action: 'db_migration', riskLevel: 'high', owner: 'platform' },
  file_delete: { action: 'file_delete', riskLevel: 'high', owner: 'orchestration' },
  api_breaking_change: { action: 'api_breaking_change', riskLevel: 'high', owner: 'orchestration' },
  dependency_bump: { action: 'dependency_bump', riskLevel: 'medium', owner: 'security' },
  security_auth_change: { action: 'security_auth_change', riskLevel: 'high', owner: 'security' },
  production_config_change: { action: 'production_config_change', riskLevel: 'high', owner: 'platform' },
  bulk_file_change: { action: 'bulk_file_change', riskLevel: 'high', owner: 'orchestration' },
};

export function classifyExecutionPolicyActionRisk(action: ExecutionPolicyActionType): ActionRiskClassification<ExecutionPolicyActionType> {
  return EXECUTION_POLICY_RISK_MATRIX[action];
}

export function classifyApprovalRequestedActionRisk(action: ApprovalRequestedAction): ActionRiskClassification<ApprovalRequestedAction> {
  return APPROVAL_REQUEST_RISK_MATRIX[action];
}
