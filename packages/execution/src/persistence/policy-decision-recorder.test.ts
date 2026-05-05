import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyProjectState } from '@ai-orchestrator/core';
import { WorkflowPolicyError } from '@ai-orchestrator/shared';
import { InMemoryStateStore } from '@ai-orchestrator/state';

import { PolicyDecisionRecorder } from './policy-decision-recorder.js';

function makeInput() {
  const state = createEmptyProjectState({
    projectId: 'p1',
    projectName: 'Project',
    summary: 'Summary',
  });
  return {
    state,
    runId: 'run-1',
    taskId: 'task-1',
    stepId: 'task-1:git_commit',
    attempt: 0,
    actionType: 'git_commit' as const,
    inputHashSeed: 'seed',
    reasonCodes: ['REPO_CHANGES_PRESENT'],
  };
}

test('PolicyDecisionRecorder persists and verifies allow decision', async () => {
  const input = makeInput();
  const store = new InMemoryStateStore(input.state);
  const recorder = new PolicyDecisionRecorder(store);

  await recorder.persistAndRequire(input);

  assert.equal(input.state.policyDecisions.length, 1);
  assert.equal(input.state.policyDecisions[0]?.decision, 'allow');
});

test('PolicyDecisionRecorder fails when persisted decision is missing', async () => {
  const input = makeInput();
  const store = new InMemoryStateStore(input.state);
  store.getPolicyDecision = async () => null;
  const recorder = new PolicyDecisionRecorder(store);

  await assert.rejects(
    () => recorder.persistAndRequire(input),
    (error: unknown) =>
      error instanceof WorkflowPolicyError
      && String((error.details as { policyCode?: string }).policyCode) === 'POLICY_DECISION_MISSING',
  );
});

test('PolicyDecisionRecorder fails on denied decision', async () => {
  const input = makeInput();
  const store = new InMemoryStateStore(input.state);
  const originalGet = store.getPolicyDecision.bind(store);
  store.getPolicyDecision = async (query) => {
    const decision = await originalGet(query);
    return decision ? { ...decision, decision: 'deny' as const } : decision;
  };
  const recorder = new PolicyDecisionRecorder(store);

  await assert.rejects(
    () => recorder.persistAndRequire(input),
    (error: unknown) =>
      error instanceof WorkflowPolicyError
      && String((error.details as { policyCode?: string }).policyCode) === 'POLICY_DENIED',
  );
});
