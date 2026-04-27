import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createEmptyProjectState,
  makeEvent,
} from '../packages/core/src/index.ts';
import {
  InMemoryStateStore,
  SqliteStateStore,
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

test('SqliteStateStore persists snapshots and domain events', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'ai-orchestrator-'));
  const dbPath = path.join(tempDir, 'state.db');

  try {
    const store = new SqliteStateStore(dbPath, makeState());
    const initial = makeState();
    await store.save(initial);
    await store.recordEvent(
      makeEvent('BOOTSTRAP_COMPLETED', {
        projectId: initial.projectId,
      }),
    );
    await store.recordFailure({
      taskId: 'task-1',
      role: 'tester',
      reason: 'Failing scenario',
    });

    const loaded = await store.load();
    assert.equal(loaded.failures.length, 1);
    assert.equal(loaded.execution.retryCounts['task-1'], 1);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('saveWithEvents persists snapshot and events together', async () => {
  const event = makeEvent('STATE_COMMITTED', { taskId: 'task-1' }, { runId: crypto.randomUUID() });
  const memoryStore = new InMemoryStateStore(makeState());
  const memoryState = await memoryStore.load();
  memoryState.execution.stepCount = 1;

  await memoryStore.saveWithEvents(memoryState, [event]);
  const loadedMemory = await memoryStore.load();
  const memoryEvents = await memoryStore.listEvents({ eventType: 'STATE_COMMITTED' });
  assert.equal(loadedMemory.execution.stepCount, 1);
  assert.equal(memoryEvents.length, 1);

  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'ai-orchestrator-'));
  const dbPath = path.join(tempDir, 'state.db');
  try {
    const sqliteStore = new SqliteStateStore(dbPath, makeState());
    const sqliteState = await sqliteStore.load();
    sqliteState.execution.stepCount = 2;

    await sqliteStore.saveWithEvents(sqliteState, [event]);
    const loadedSqlite = await sqliteStore.load();
    const sqliteEvents = await sqliteStore.listEvents({ eventType: 'STATE_COMMITTED' });
    assert.equal(loadedSqlite.execution.stepCount, 2);
    assert.equal(sqliteEvents.length, 1);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('state stores persist and query run steps without relying on event stream', async () => {
  const step = {
    id: crypto.randomUUID(),
    runId: crypto.randomUUID(),
    taskId: 'task-1',
    role: 'coder',
    tool: 'git_status',
    input: '{"path":"."}',
    output: '{"changed":false}',
    status: 'succeeded' as const,
    durationMs: 12,
    createdAt: new Date().toISOString(),
  };

  const memoryStore = new InMemoryStateStore(makeState());
  await memoryStore.recordRunStep(step);
  const memorySteps = await memoryStore.listRunSteps({ runId: step.runId });
  assert.equal(memorySteps.length, 1);
  assert.equal(memorySteps[0]?.tool, 'git_status');
  assert.equal((await memoryStore.listEvents({ eventType: 'TASK_SELECTED' })).length, 0);

  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'ai-orchestrator-'));
  const dbPath = path.join(tempDir, 'state.db');
  try {
    const sqliteStore = new SqliteStateStore(dbPath, makeState());
    await sqliteStore.recordRunStep(step);
    const sqliteSteps = await sqliteStore.listRunSteps({ runId: step.runId });
    assert.equal(sqliteSteps.length, 1);
    assert.equal(sqliteSteps[0]?.role, 'coder');
    assert.equal((await sqliteStore.listEvents({ eventType: 'TASK_SELECTED' })).length, 0);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
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

test('SqliteStateStore rejects artifacts that violate schema registry', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'ai-orchestrator-'));
  const dbPath = path.join(tempDir, 'state.db');

  try {
    const store = new SqliteStateStore(dbPath, makeState());
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
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('SqliteStateStore rejects snapshot writes when deep state validation fails', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'ai-orchestrator-'));
  const dbPath = path.join(tempDir, 'state.db');

  try {
    const store = new SqliteStateStore(dbPath, makeState());
    await assert.rejects(
      async () =>
        store.recordDecision({
          id: 'decision-1',
          title: '',
          decision: 'Use PostgreSQL',
          rationale: 'Need persistence',
          affectedAreas: ['state'],
          createdAt: new Date().toISOString(),
        }),
      /PostgreSQL state transaction failed/,
    );

    const loaded = await store.load();
    assert.equal(loaded.decisions.length, 0);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
