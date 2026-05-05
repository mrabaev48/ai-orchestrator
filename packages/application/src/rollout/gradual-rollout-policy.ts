import type { RolloutConfigStore, RolloutRiskTier, GradualRolloutRule } from '../../../state/src/rollout/rollout-config.store.ts';

export interface GradualRolloutRequest {
  tenantId: string;
  projectId: string;
  riskTier: RolloutRiskTier;
  rolloutKey: string;
}

export interface GradualRolloutDecision {
  status: 'enabled' | 'disabled';
  reasonCode: 'ROLLOUT_MATCH' | 'ROLLOUT_NOT_CONFIGURED' | 'ROLLOUT_DISABLED' | 'ROLLOUT_INPUT_INVALID';
  evidence: {
    selectedRuleId?: string;
    selectedScope?: 'global' | 'tenant' | 'tenant_project';
    rolloutPercent?: number;
    bucket?: number;
  };
}

export function evaluateGradualRolloutPolicy(
  request: GradualRolloutRequest,
  store: RolloutConfigStore,
): GradualRolloutDecision {
  if (!request.tenantId || !request.projectId || !request.rolloutKey) {
    return { status: 'disabled', reasonCode: 'ROLLOUT_INPUT_INVALID', evidence: {} };
  }

  const matchingRules = store
    .listRules()
    .filter((rule) => rule.riskTier === request.riskTier)
    .sort(compareRuleSpecificity);

  const selectedRule = matchingRules.find((rule) => matchesScope(rule, request));
  if (!selectedRule) {
    return { status: 'disabled', reasonCode: 'ROLLOUT_NOT_CONFIGURED', evidence: {} };
  }

  const scope = resolveScope(selectedRule);
  if (!selectedRule.enabled) {
    return {
      status: 'disabled',
      reasonCode: 'ROLLOUT_DISABLED',
      evidence: { selectedRuleId: selectedRule.ruleId, selectedScope: scope, rolloutPercent: selectedRule.rolloutPercent },
    };
  }

  const bucket = stableBucket(request.rolloutKey);
  const isEnabled = bucket < selectedRule.rolloutPercent;

  return {
    status: isEnabled ? 'enabled' : 'disabled',
    reasonCode: isEnabled ? 'ROLLOUT_MATCH' : 'ROLLOUT_DISABLED',
    evidence: {
      selectedRuleId: selectedRule.ruleId,
      selectedScope: scope,
      rolloutPercent: selectedRule.rolloutPercent,
      bucket,
    },
  };
}

function compareRuleSpecificity(left: GradualRolloutRule, right: GradualRolloutRule): number {
  return specificity(right) - specificity(left);
}

function specificity(rule: GradualRolloutRule): number {
  if (rule.tenantId && rule.projectId) return 3;
  if (rule.tenantId) return 2;
  return 1;
}

function resolveScope(rule: GradualRolloutRule): 'global' | 'tenant' | 'tenant_project' {
  if (rule.tenantId && rule.projectId) return 'tenant_project';
  if (rule.tenantId) return 'tenant';
  return 'global';
}

function matchesScope(rule: GradualRolloutRule, request: GradualRolloutRequest): boolean {
  if (rule.tenantId && rule.tenantId !== request.tenantId) return false;
  if (rule.projectId && rule.projectId !== request.projectId) return false;
  return true;
}

function stableBucket(key: string): number {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = ((hash << 5) - hash) + key.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash % 100);
}
