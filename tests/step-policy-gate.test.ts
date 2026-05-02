import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyProjectState } from '../packages/core/src/project-state.ts';
import { buildStepPolicyGateRequest } from '../packages/execution/src/steps/step-policy-gate.ts';

test('buildStepPolicyGateRequest builds deterministic per-step payload with risk classification', () => {
  const state = createEmptyProjectState({ projectId: 'orchestrator', projectName: 'Orchestrator', summary: 'Step gate' });

  const payload = buildStepPolicyGateRequest({
    state,
    runId: 'run-42',
    taskId: 'TASK-8',
    stepId: 'TASK-8:git_push',
    attempt: 1,
    actionType: 'git_push',
    inputHashSeed: 'run-42:TASK-8:git_push',
    reasonCodes: ['APPROVAL_GATE_PASSED'],
  });

  assert.equal(payload.riskLevel, 'high');
  assert.equal(payload.stepId, 'TASK-8:git_push');
  assert.equal(payload.attempt, 1);
  assert.equal(payload.reasonCodes[0], 'APPROVAL_GATE_PASSED');
});

