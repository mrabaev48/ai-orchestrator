import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEmptyProjectState,
} from '../packages/core/src/index.ts';
import {
  InMemoryStateStore,
} from '../packages/state/src/index.ts';

function makeState() {
  const state = createEmptyProjectState({
    projectId: 'proj-1',
    projectName: 'Project',
    summary: 'Summary',
  });

  state.backlog.features['feature-1'] = {
    id: 'feature-1',
    epicId: 'epic-1',
    title: 'Feature',
    outcome: 'Outcome',
    risks: [],
    taskIds: ['task-1'],
  };
  state.backlog.epics['epic-1'] = {
    id: 'epic-1',
    title: 'Epic',
    goal: 'Goal',
    status: 'todo',
    featureIds: ['feature-1'],
  };
  state.backlog.tasks['task-1'] = {
    id: 'task-1',
    featureId: 'feature-1',
    title: 'Task',
    kind: 'implementation',
    status: 'todo',
    priority: 'p1',
    dependsOn: [],
    acceptanceCriteria: ['done'],
    affectedModules: ['packages/core'],
    estimatedRisk: 'low',
  };

  return state;
}

test('InMemoryStateStore records failures and marks tasks done', async () => {
  const store = new InMemoryStateStore(makeState());
  await store.recordFailure({
    taskId: 'task-1',
    role: 'reviewer',
    reason: 'Missing tests',
  });
  await store.markTaskDone('task-1', 'Implemented successfully');

  const state = await store.load();
  assert.equal(state.execution.retryCounts['task-1'], 1);
  assert.equal(state.backlog.tasks['task-1']?.status, 'done');
  assert.equal(state.artifacts.length, 1);
});

test('InMemoryStateStore rejects artifacts that violate schema registry', async () => {
  const store = new InMemoryStateStore(makeState());

  await assert.rejects(
    async () =>
      store.recordArtifact({
        id: 'artifact-1',
        type: 'release_assessment',
        title: 'Release assessment',
        metadata: {},
        createdAt: new Date().toISOString(),
      }),
    /Artifact schema validation failed/,
  );
});


test('InMemoryStateStore enforces closed run-step status transitions per attempt', async () => {
  const store = new InMemoryStateStore(makeState());
  const now = Date.now();

  const base = {
    tenantId: 'default-org',
    projectId: 'proj-1',
    runId: 'run-1',
    stepId: 'step-1',
    attempt: 0,
    role: 'tester',
    input: 'input',
    output: 'output',
    idempotencyKey: 'key-1',
    checksum: 'checksum-1',
    traceId: 'trace-1',
    durationMs: 1,
    createdAt: new Date(now).toISOString(),
  } as const;

  await store.recordRunStep({ id: 'ev-1', ...base, status: 'cancellation_requested' });
  await store.recordRunStep({ id: 'ev-2', ...base, status: 'cancelled', checksum: 'checksum-2', createdAt: new Date(now + 1_000).toISOString() });

  await assert.rejects(
    async () =>
      store.recordRunStep({
        id: 'ev-3',
        ...base,
        status: 'cancelled',
        checksum: 'checksum-3',
        createdAt: new Date(now + 2_000).toISOString(),
      }),
    /Illegal run step status transition/,
  );
});



test('InMemoryStateStore rejects run-step records from a different tenant/project scope', async () => {
  const store = new InMemoryStateStore(makeState());
  await assert.rejects(
    async () =>
      store.recordRunStep({
        id: 'ev-cross-tenant',
        tenantId: 'other-tenant',
        projectId: 'proj-1',
        runId: 'run-1',
        stepId: 'step-1',
        attempt: 0,
        role: 'tester',
        input: 'input',
        output: 'output',
        status: 'succeeded',
        idempotencyKey: 'key-1',
        checksum: 'checksum-1',
        traceId: 'trace-1',
        durationMs: 1,
        createdAt: new Date().toISOString(),
      }),
    /TENANT_PARTITION_GUARD_VIOLATION/,
  );
});

