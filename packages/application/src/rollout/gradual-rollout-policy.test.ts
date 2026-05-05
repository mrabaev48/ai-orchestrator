import assert from 'node:assert/strict';
import test from 'node:test';

import type { GradualRolloutRule, RolloutConfigStore } from '../ports.js';
import { evaluateGradualRolloutPolicy } from './gradual-rollout-policy.js';

class TestRolloutConfigStore implements RolloutConfigStore {
  readonly #rules: readonly GradualRolloutRule[];

  constructor(rules: readonly GradualRolloutRule[]) {
    this.#rules = rules;
  }

  listRules(): readonly GradualRolloutRule[] {
    return this.#rules;
  }
}

void test('GradualRolloutPolicy: enables rollout for matching tenant/project rule', () => {
  const store = new TestRolloutConfigStore([
    { ruleId: 'global-low', riskTier: 'low', enabled: true, rolloutPercent: 0, createdAt: '2026-05-05T00:00:00.000Z' },
    { ruleId: 'tenant-project-low', riskTier: 'low', enabled: true, rolloutPercent: 100, tenantId: 'tenant-a', projectId: 'proj-a', createdAt: '2026-05-05T00:00:00.000Z' },
  ]);

  const decision = evaluateGradualRolloutPolicy({ tenantId: 'tenant-a', projectId: 'proj-a', riskTier: 'low', rolloutKey: 'run-123' }, store);

  assert.equal(decision.status, 'enabled');
  assert.equal(decision.reasonCode, 'ROLLOUT_MATCH');
  assert.equal(decision.evidence.selectedRuleId, 'tenant-project-low');
  assert.equal(decision.evidence.selectedScope, 'tenant_project');
});

void test('GradualRolloutPolicy: returns not configured when matching risk-tier rule does not exist', () => {
  const store = new TestRolloutConfigStore([
    { ruleId: 'global-high', riskTier: 'high', enabled: true, rolloutPercent: 25, createdAt: '2026-05-05T00:00:00.000Z' },
  ]);

  const decision = evaluateGradualRolloutPolicy({ tenantId: 'tenant-a', projectId: 'proj-a', riskTier: 'low', rolloutKey: 'run-123' }, store);

  assert.equal(decision.status, 'disabled');
  assert.equal(decision.reasonCode, 'ROLLOUT_NOT_CONFIGURED');
});

void test('GradualRolloutPolicy: is deterministic for identical rollout key and config', () => {
  const store = new TestRolloutConfigStore([
    { ruleId: 'global-medium', riskTier: 'medium', enabled: true, rolloutPercent: 50, createdAt: '2026-05-05T00:00:00.000Z' },
  ]);

  const request = { tenantId: 'tenant-a', projectId: 'proj-a', riskTier: 'medium' as const, rolloutKey: 'same-key' };
  const first = evaluateGradualRolloutPolicy(request, store);
  const second = evaluateGradualRolloutPolicy(request, store);

  assert.equal(first.status, second.status);
  assert.equal(first.evidence.bucket, second.evidence.bucket);
});

void test('GradualRolloutPolicy: returns invalid input for missing required fields', () => {
  const store = new TestRolloutConfigStore([]);
  const decision = evaluateGradualRolloutPolicy({ tenantId: '', projectId: 'p', riskTier: 'low', rolloutKey: '' }, store);

  assert.equal(decision.status, 'disabled');
  assert.equal(decision.reasonCode, 'ROLLOUT_INPUT_INVALID');
});
