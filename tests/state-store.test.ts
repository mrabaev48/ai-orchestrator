import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEmptyProjectState,
  makeEvent,
} from '@ai-orchestrator/core';
import { StateStoreError } from '@ai-orchestrator/shared';
import {
  InMemoryStateStore,
} from '@ai-orchestrator/state';
import { createPostgresMigrations } from '../packages/state/src/postgres/migrations.js';

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
  const failureResult = await store.recordFailure({
    taskId: 'task-1',
    role: 'reviewer',
    reason: 'Missing tests',
  });
  await store.markTaskDone('task-1', 'Implemented successfully');

  const state = await store.load();
  assert.equal(failureResult.retryCount, 1);
  assert.equal(state.execution.retryCounts['task-1'], 1);
  assert.equal(state.backlog.tasks['task-1']?.status, 'done');
  assert.equal(state.artifacts.length, 1);
});

test('InMemoryStateStore preserves the full failure persistence contract', async () => {
  const store = new InMemoryStateStore(makeState());
  const deadLetteredAt = new Date('2026-05-06T12:00:00.000Z').toISOString();

  const firstFailure = await store.recordFailure({
    taskId: 'task-1',
    role: 'tester',
    reason: 'Tests failed',
    symptoms: ['unit test red'],
    badPatterns: ['missing regression'],
    retrySuggested: false,
    status: 'dead_lettered',
    checkpointRunId: 'run-1',
    checkpointStepId: 'step-1',
    deadLetteredAt,
  });
  const secondFailure = await store.recordFailure({
    taskId: 'task-1',
    role: 'reviewer',
    reason: 'Review rejected',
  });

  const state = await store.load();
  const persistedFailure = state.failures[0];
  assert.equal(firstFailure.retryCount, 1);
  assert.equal(secondFailure.retryCount, 2);
  assert.equal(state.execution.retryCounts['task-1'], 2);
  assert.equal(persistedFailure?.taskId, 'task-1');
  assert.equal(persistedFailure?.role, 'tester');
  assert.equal(persistedFailure?.reason, 'Tests failed');
  assert.deepEqual(persistedFailure?.symptoms, ['unit test red']);
  assert.deepEqual(persistedFailure?.badPatterns, ['missing regression']);
  assert.equal(persistedFailure?.retrySuggested, false);
  assert.equal(persistedFailure?.status, 'dead_lettered');
  assert.equal(persistedFailure?.checkpointRunId, 'run-1');
  assert.equal(persistedFailure?.checkpointStepId, 'step-1');
  assert.equal(persistedFailure?.deadLetteredAt, deadLetteredAt);
});

test('Postgres failure_log migrations include the full failure contract fields', () => {
  const migrations = createPostgresMigrations((name) => name);
  const failureContractMigration = migrations.find((migration) => migration.name === 'failure_log_contract_fields');

  assert.ok(failureContractMigration);
  assert.deepEqual(failureContractMigration.statements, [
    'ALTER TABLE failure_log ADD COLUMN IF NOT EXISTS status TEXT',
    'ALTER TABLE failure_log ADD COLUMN IF NOT EXISTS checkpoint_run_id TEXT',
    'ALTER TABLE failure_log ADD COLUMN IF NOT EXISTS checkpoint_step_id TEXT',
    'ALTER TABLE failure_log ADD COLUMN IF NOT EXISTS dead_lettered_at TIMESTAMPTZ',
  ]);
});

test('InMemoryStateStore rejects stale whole-snapshot saves without losing newer state', async () => {
  const store = new InMemoryStateStore(makeState());
  const firstWriter = await store.load();
  const staleWriter = await store.load();

  firstWriter.summary = 'Updated by first writer';
  await store.save(firstWriter, { expectedRevision: firstWriter.revision });

  staleWriter.projectName = 'Stale writer project name';
  await assert.rejects(
    async () => store.save(staleWriter, { expectedRevision: staleWriter.revision }),
    isRevisionConflict,
  );

  const state = await store.load();
  assert.equal(state.revision, 1);
  assert.equal(state.summary, 'Updated by first writer');
  assert.equal(state.projectName, 'Project');
});

test('InMemoryStateStore rejects stale saveWithEvents without recording events', async () => {
  const store = new InMemoryStateStore(makeState());
  const firstWriter = await store.load();
  const staleWriter = await store.load();

  firstWriter.summary = 'Committed summary';
  await store.save(firstWriter, { expectedRevision: firstWriter.revision });

  staleWriter.summary = 'Stale summary';
  await assert.rejects(
    async () =>
      store.saveWithEvents(
        staleWriter,
        [makeEvent('STATE_COMMITTED', { taskId: 'task-1' })],
        { expectedRevision: staleWriter.revision },
      ),
    isRevisionConflict,
  );

  assert.deepEqual(await store.listEvents(), []);
  assert.equal((await store.load()).summary, 'Committed summary');
});

test('InMemoryStateStore serializes concurrent mutation methods without lost updates', async () => {
  const store = new InMemoryStateStore(makeState());

  await Promise.all([
    store.recordArtifact({
      id: 'artifact-1',
      type: 'report',
      title: 'First report',
      metadata: { taskId: 'task-1' },
      createdAt: new Date().toISOString(),
    }),
    store.recordArtifact({
      id: 'artifact-2',
      type: 'report',
      title: 'Second report',
      metadata: { taskId: 'task-1' },
      createdAt: new Date().toISOString(),
    }),
    store.recordFailure({
      taskId: 'task-1',
      role: 'reviewer',
      reason: 'Concurrent failure',
    }),
  ]);

  const state = await store.load();
  assert.equal(state.revision, 3);
  assert.equal(state.artifacts.length, 2);
  assert.deepEqual(state.artifacts.map((artifact) => artifact.id).sort(), ['artifact-1', 'artifact-2']);
  assert.equal(state.failures.length, 1);
  assert.equal(state.execution.retryCounts['task-1'], 1);
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

function isRevisionConflict(error: unknown): boolean {
  return error instanceof StateStoreError
    && error.details != null
    && typeof error.details === 'object'
    && 'code' in error.details
    && error.details.code === 'STATE_REVISION_CONFLICT';
}

