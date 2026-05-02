import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPreflightPolicyGateDecisionRequest } from '../packages/execution/src/index.ts';
import { createEmptyProjectState, type BacklogTask } from '../packages/core/src/index.ts';

test('buildPreflightPolicyGateDecisionRequest returns deterministic non-bypass preflight decision payload', () => {
  const state = createEmptyProjectState({ projectId: 'orchestrator', projectName: 'Orchestrator', summary: 'Preflight gate' });
  const task: BacklogTask = {
    id: 'TASK-007',
    featureId: 'feature-1',
    title: 'preflight gate',
    kind: 'implementation',
    status: 'todo',
    priority: 'p1',
    dependsOn: [],
    acceptanceCriteria: ['policy decision is persisted and verified'],
    affectedModules: ['packages/execution'],
    estimatedRisk: 'medium',
  };

  const decision = buildPreflightPolicyGateDecisionRequest({ state, runId: 'run-001', task });

  assert.equal(decision.state, state);
  assert.equal(decision.runId, 'run-001');
  assert.equal(decision.taskId, 'TASK-007');
  assert.equal(decision.stepId, 'TASK-007:preflight_policy');
  assert.equal(decision.attempt, 0);
  assert.equal(decision.actionType, 'artifact_write');
  assert.equal(decision.riskLevel, 'low');
  assert.equal(decision.inputHashSeed, 'run-001:TASK-007:preflight');
  assert.deepEqual(decision.reasonCodes, ['NON_BYPASS_PREFLIGHT_CHECK']);
});
