import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateAutonomyLevel } from '../packages/application/src/index.ts';
import { getAutonomyPolicyProfile } from '../packages/core/src/index.ts';

test('autonomy level profile mapping is deterministic for L0 and L5', () => {
  assert.deepEqual(getAutonomyPolicyProfile('L0'), {
    level: 'L0',
    maxRiskLevel: 'low',
    allowAutomatedExecution: false,
    requiresHumanApproval: true,
    allowSideEffects: false,
  });

  assert.deepEqual(getAutonomyPolicyProfile('L5'), {
    level: 'L5',
    maxRiskLevel: 'high',
    allowAutomatedExecution: true,
    requiresHumanApproval: false,
    allowSideEffects: true,
  });
});

test('controller returns allow for L5 high risk side effects', () => {
  const decision = evaluateAutonomyLevel({
    autonomyLevel: 'L5',
    riskLevel: 'high',
    requestedSideEffects: true,
  });

  assert.equal(decision.outcome.outcome, 'allow');
  assert.deepEqual(decision.outcome.reasonCodes, []);
});

test('controller returns deny for side effects at L1', () => {
  const decision = evaluateAutonomyLevel({
    autonomyLevel: 'L1',
    riskLevel: 'low',
    requestedSideEffects: true,
  });

  assert.equal(decision.outcome.outcome, 'deny');
  assert.deepEqual(decision.outcome.reasonCodes, ['side_effects_not_allowed_for_autonomy_level']);
});

test('controller returns deny when risk exceeds autonomy threshold', () => {
  const decision = evaluateAutonomyLevel({
    autonomyLevel: 'L3',
    riskLevel: 'high',
  });

  assert.equal(decision.outcome.outcome, 'deny');
  assert.deepEqual(decision.outcome.reasonCodes, ['risk_above_autonomy_threshold']);
});

test('controller enforces emergency stop deterministically', () => {
  const decision = evaluateAutonomyLevel({
    autonomyLevel: 'L5',
    riskLevel: 'low',
    emergencyStop: true,
    requestedSideEffects: false,
  });

  assert.equal(decision.outcome.outcome, 'deny');
  assert.deepEqual(decision.outcome.reasonCodes, ['emergency_stop_active']);
});
