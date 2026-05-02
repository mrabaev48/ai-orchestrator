import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPostflightPolicyGateDecisionRequest } from '../packages/execution/src/index.ts';
import { createEmptyProjectState, type BacklogTask } from '../packages/core/src/index.ts';

test('buildPostflightPolicyGateDecisionRequest returns deterministic non-bypass postflight decision payload', () => {
  const state = createEmptyProjectState({ projectId: 'orchestrator', projectName: 'Orchestrator', summary: 'Postflight gate' });
  const task: BacklogTask = {
    id: 'TASK-009',
    featureId: 'feature-1',
    title: 'postflight gate',
    kind: 'implementation',
    status: 'todo',
    priority: 'p1',
    dependsOn: [],
    acceptanceCriteria: ['policy decision is persisted and verified before final state commit'],
    affectedModules: ['packages/execution'],
    estimatedRisk: 'medium',
  };

  const decision = buildPostflightPolicyGateDecisionRequest({ state, runId: 'run-009', task });

  assert.equal(decision.state, state);
  assert.equal(decision.runId, 'run-009');
  assert.equal(decision.taskId, 'TASK-009');
  assert.equal(decision.stepId, 'TASK-009:postflight_policy');
  assert.equal(decision.attempt, 0);
  assert.equal(decision.actionType, 'artifact_write');
  assert.equal(decision.riskLevel, 'low');
  assert.equal(decision.inputHashSeed, 'run-009:TASK-009:postflight');
  assert.deepEqual(decision.reasonCodes, ['NON_BYPASS_POSTFLIGHT_CHECK']);
});
