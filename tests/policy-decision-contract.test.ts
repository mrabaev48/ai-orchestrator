import assert from 'node:assert/strict';
import test from 'node:test';

import { assertPolicyDecisionForAction } from '../packages/application/src/policy-decision-contract.ts';
import { validateExecutionPolicyDecision, type ExecutionPolicyDecision } from '../packages/core/src/execution-policy-decision.ts';

function createDecision(overrides: Partial<ExecutionPolicyDecision> = {}): ExecutionPolicyDecision {
  return {
    decisionId: 'decision-1',
    tenantId: 'tenant-1',
    projectId: 'project-1',
    runId: 'run-1',
    stepId: 'step-1',
    attempt: 1,
    actionType: 'git_push',
    riskLevel: 'high',
    decision: 'allow',
    reasonCodes: ['policy.ok'],
    decidedAt: '2026-01-01T00:00:00.000Z',
    decider: 'policy-engine-v1',
    inputHash: 'hash',
    traceId: 'trace-1',
    policyVersion: 'policyDecisionPersistenceV1',
    ...overrides,
  };
}

test('validateExecutionPolicyDecision returns no issues for valid decision', () => {
  const issues = validateExecutionPolicyDecision(createDecision(), {
    tenantId: 'tenant-1',
    projectId: 'project-1',
    runId: 'run-1',
  });

  assert.deepEqual(issues, []);
});

test('validateExecutionPolicyDecision requires reasonCodes for deny and error decisions', () => {
  const issues = validateExecutionPolicyDecision(createDecision({ decision: 'deny', reasonCodes: [] }));
  assert.equal(issues.some((issue) => issue.includes('reasonCodes')), true);
});

test('assertPolicyDecisionForAction throws missing/stale/deny errors deterministically', () => {
  assert.throws(
    () =>
      assertPolicyDecisionForAction({
        decision: undefined,
        actionType: 'git_push',
        expected: { tenantId: 'tenant-1', projectId: 'project-1', runId: 'run-1' },
      }),
    /missing/i,
  );

  assert.throws(
    () =>
      assertPolicyDecisionForAction({
        decision: createDecision({ projectId: 'other-project' }),
        actionType: 'git_push',
        expected: { tenantId: 'tenant-1', projectId: 'project-1', runId: 'run-1' },
      }),
    /stale/i,
  );

  assert.throws(
    () =>
      assertPolicyDecisionForAction({
        decision: createDecision({ decision: 'deny' }),
        actionType: 'git_push',
        expected: { tenantId: 'tenant-1', projectId: 'project-1', runId: 'run-1' },
      }),
    /denied/i,
  );
});
