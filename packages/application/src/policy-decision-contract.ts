import {
  formatPolicyDecisionError,
  validateExecutionPolicyDecision,
  type ExecutionPolicyActionType,
  type ExecutionPolicyDecision,
} from '../../core/src/index.ts';

export function assertPolicyDecisionForAction(input: {
  decision: ExecutionPolicyDecision | undefined;
  actionType: ExecutionPolicyActionType;
  expected: { tenantId: string; projectId: string; runId: string };
}): ExecutionPolicyDecision {
  const decision = input.decision;
  if (!decision) {
    throw new Error(formatPolicyDecisionError('POLICY_DECISION_MISSING', input.actionType));
  }

  const issues = validateExecutionPolicyDecision(decision, input.expected);
  if (issues.length > 0) {
    throw new Error(formatPolicyDecisionError('POLICY_DECISION_STALE', input.actionType));
  }

  if (decision.decision !== 'allow') {
    throw new Error(formatPolicyDecisionError('POLICY_DENIED', input.actionType));
  }

  return decision;
}
