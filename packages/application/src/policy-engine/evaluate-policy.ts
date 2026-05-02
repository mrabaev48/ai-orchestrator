import { policyOutcomeSchema, type PolicyOutcome, type PolicyOutcomeType } from '../../../core/src/policy/policy-outcome.ts';
import type { ExecutionPolicyRiskLevel } from '../../../core/src/execution-policy-decision.ts';

export interface EvaluatePolicyInput {
  riskLevel: ExecutionPolicyRiskLevel;
  requiresApproval: boolean;
  isPolicyBackendHealthy: boolean;
  denyReasonCodes?: string[];
}

const OUTCOME_BY_RISK: Record<ExecutionPolicyRiskLevel, PolicyOutcomeType> = {
  low: 'allow',
  medium: 'requires_approval',
  high: 'deny',
};

export function evaluatePolicy(input: EvaluatePolicyInput): PolicyOutcome {
  if (!input.isPolicyBackendHealthy) {
    const deferred: PolicyOutcome = {
      outcome: 'defer',
      reasonCodes: ['policy_backend_unavailable'],
      rationale: 'Policy backend unavailable; action deferred until policy service recovers.',
    };
    return policyOutcomeSchema.parse(deferred);
  }

  if (input.denyReasonCodes && input.denyReasonCodes.length > 0) {
    const denied: PolicyOutcome = {
      outcome: 'deny',
      reasonCodes: [...new Set(input.denyReasonCodes)],
      rationale: 'Action explicitly denied by policy reason codes.',
    };
    return policyOutcomeSchema.parse(denied);
  }

  const baseOutcome = OUTCOME_BY_RISK[input.riskLevel];

  if (input.requiresApproval && baseOutcome !== 'deny') {
    const approval: PolicyOutcome = {
      outcome: 'requires_approval',
      reasonCodes: ['manual_approval_required'],
      rationale: 'Action requires explicit approval before execution.',
    };
    return policyOutcomeSchema.parse(approval);
  }

  if (baseOutcome === 'allow') {
    return policyOutcomeSchema.parse({
      outcome: 'allow',
      reasonCodes: [],
      rationale: 'Risk level within autonomous execution allowance.',
    });
  }

  if (baseOutcome === 'requires_approval') {
    return policyOutcomeSchema.parse({
      outcome: 'requires_approval',
      reasonCodes: ['risk_moderate'],
      rationale: 'Moderate risk action requires approval by default policy.',
    });
  }

  return policyOutcomeSchema.parse({
    outcome: 'deny',
    reasonCodes: ['risk_high'],
    rationale: 'High risk action denied by default policy.',
  });
}
