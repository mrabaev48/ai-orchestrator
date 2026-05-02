import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluatePolicy } from '../packages/application/src/index.ts';
import { validatePolicyOutcome } from '../packages/core/src/index.ts';
import { validatePolicyDecisionRecord } from '../packages/state/src/index.ts';

test('evaluatePolicy returns allow for low-risk healthy policy backend', () => {
  const outcome = evaluatePolicy({
    riskLevel: 'low',
    requiresApproval: false,
    isPolicyBackendHealthy: true,
  });

  assert.equal(outcome.outcome, 'allow');
  assert.deepEqual(validatePolicyOutcome(outcome), []);
});

test('evaluatePolicy returns defer when backend is unavailable', () => {
  const outcome = evaluatePolicy({
    riskLevel: 'high',
    requiresApproval: true,
    isPolicyBackendHealthy: false,
  });

  assert.equal(outcome.outcome, 'defer');
  assert.deepEqual(outcome.reasonCodes, ['policy_backend_unavailable']);
});

test('evaluatePolicy returns deny for explicit deny reason codes', () => {
  const outcome = evaluatePolicy({
    riskLevel: 'low',
    requiresApproval: false,
    isPolicyBackendHealthy: true,
    denyReasonCodes: ['quota_exceeded', 'quota_exceeded'],
  });

  assert.equal(outcome.outcome, 'deny');
  assert.deepEqual(outcome.reasonCodes, ['quota_exceeded']);
});

test('policy decision record validates deterministic shape', () => {
  const issues = validatePolicyDecisionRecord({
    decisionId: 'd1',
    runId: 'r1',
    stepId: 's1',
    decidedAt: new Date('2026-05-02T00:00:00.000Z').toISOString(),
    outcome: {
      outcome: 'requires_approval',
      reasonCodes: ['manual_approval_required'],
      rationale: 'Need human approval',
    },
  });

  assert.deepEqual(issues, []);
});
