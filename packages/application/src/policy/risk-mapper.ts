import {
  classifyApprovalRequestedActionRisk,
  classifyExecutionPolicyActionRisk,
  type ActionRiskClassification,
  type ApprovalRequestedAction,
  type ExecutionPolicyActionType,
} from '@ai-orchestrator/core';

export function mapExecutionPolicyActionRisk(actionType: ExecutionPolicyActionType): ActionRiskClassification<ExecutionPolicyActionType> {
  return classifyExecutionPolicyActionRisk(actionType);
}

export function mapApprovalRequestedActionRisk(action: ApprovalRequestedAction): ActionRiskClassification<ApprovalRequestedAction> {
  return classifyApprovalRequestedActionRisk(action);
}
