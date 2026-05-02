import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyApprovalRequestedActionRisk,
  classifyExecutionPolicyActionRisk,
  executionPolicyActionTypes,
} from '../packages/core/src/index.ts';
import { mapApprovalRequestedActionRisk, mapExecutionPolicyActionRisk } from '../packages/application/src/index.ts';

test('risk classification matrix covers all execution policy action types with deterministic ownership', () => {
  for (const actionType of executionPolicyActionTypes) {
    const classification = classifyExecutionPolicyActionRisk(actionType);
    assert.equal(classification.action, actionType);
    assert.ok(classification.owner.length > 0);
  }

  assert.equal(classifyExecutionPolicyActionRisk('git_commit').riskLevel, 'medium');
  assert.equal(classifyExecutionPolicyActionRisk('git_push').owner, 'release');
});

test('application risk mapper delegates to core risk matrix', () => {
  assert.deepEqual(
    mapExecutionPolicyActionRisk('pr_draft'),
    classifyExecutionPolicyActionRisk('pr_draft'),
  );

  assert.deepEqual(
    mapApprovalRequestedActionRisk('security_auth_change'),
    classifyApprovalRequestedActionRisk('security_auth_change'),
  );
  assert.equal(mapApprovalRequestedActionRisk('dependency_bump').riskLevel, 'medium');
});
