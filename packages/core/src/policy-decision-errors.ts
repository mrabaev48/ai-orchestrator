export type PolicyDecisionErrorCode = 'POLICY_DENIED' | 'POLICY_DECISION_MISSING' | 'POLICY_DECISION_STALE';

export function formatPolicyDecisionError(code: PolicyDecisionErrorCode, actionType: string): string {
  switch (code) {
    case 'POLICY_DENIED':
      return `Policy denied side-effect action: ${actionType}`;
    case 'POLICY_DECISION_MISSING':
      return `Persisted policy decision is missing for side-effect action: ${actionType}`;
    case 'POLICY_DECISION_STALE':
      return `Persisted policy decision is stale for side-effect action: ${actionType}`;
    default:
      return `Policy decision validation failed for side-effect action: ${actionType}`;
  }
}
