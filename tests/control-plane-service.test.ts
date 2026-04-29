import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { ControlPlaneService } from '../packages/application/src/index.ts';
import { createEmptyProjectState } from '../packages/core/src/index.ts';
import { createLogger, type RuntimeConfig } from '../packages/shared/src/index.ts';
import { InMemoryStateStore } from '../packages/state/src/index.ts';

function makeRuntimeConfig(): RuntimeConfig {
  return {
    llm: {
      provider: 'mock',
      model: 'mock-model',
      temperature: 0.2,
      timeoutMs: 1000,
    },
    state: {
      backend: 'memory',
      postgresDsn: 'postgresql://localhost:5432/test',
      postgresSchema: 'public',
      sqlitePath: '/tmp/unused.db',
      snapshotOnBootstrap: true,
      snapshotOnTaskCompletion: true,
      snapshotOnMilestoneCompletion: true,
    },
    workflow: {
      maxStepsPerRun: 5,
      maxRetriesPerTask: 2,
    },
    tools: {
      allowedWritePaths: [process.cwd()],
      typescriptDiagnosticsEnabled: true,
      allowedShellCommands: ['node', 'npm', 'pnpm', 'git', 'rg', 'tsx', 'tsc'],
      persistToolEvidence: true,
    },
    logging: {
      level: 'error',
      format: 'json',
    },
  };
}

test('ControlPlaneService bootstrap persists initial state and event', async () => {
  const state = createEmptyProjectState({
    projectId: 'project-1',
    projectName: 'Project',
    summary: 'Summary',
  });
  const store = new InMemoryStateStore(state);
  const service = new ControlPlaneService(store, createLogger(makeRuntimeConfig(), { sink: () => {} }));

  await service.bootstrap(state, true);

  const loaded = await store.load();
  assert.equal(loaded.projectId, 'project-1');
  assert.equal(store.events.length, 1);
  assert.equal(store.events[0]?.eventType, 'BOOTSTRAP_COMPLETED');
});

test('ControlPlaneService exportBacklog writes artifact file through read model', async () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'ai-orchestrator-app-'));
  const previousCwd = process.cwd();
  process.chdir(tempDir);

  try {
    const state = createEmptyProjectState({
      projectId: 'project-1',
      projectName: 'Project',
      summary: 'Summary',
    });
    const store = new InMemoryStateStore(state);
    const service = new ControlPlaneService(store, createLogger(makeRuntimeConfig(), { sink: () => {} }));

    const outputPath = await service.exportBacklog('md');
    const content = readFileSync(outputPath, 'utf8');

    assert.match(content, /# Backlog export/);
  } finally {
    process.chdir(previousCwd);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('ControlPlaneService can resume dead-lettered failure and unblock task', async () => {
  const state = createEmptyProjectState({ projectId: 'project-1', projectName: 'Project', summary: 'Summary' });
  state.backlog.tasks['task-1'] = {
    id: 'task-1', featureId: 'feature-1', title: 'Task', kind: 'implementation', status: 'blocked',
    priority: 'p1', dependsOn: [], acceptanceCriteria: ['done'], affectedModules: ['packages/execution'], estimatedRisk: 'medium',
  };
  state.backlog.features['feature-1'] = { id: 'feature-1', epicId: 'epic-1', title: 'Feature', outcome: 'Outcome', risks: [], taskIds: ['task-1'] };
  state.backlog.epics['epic-1'] = { id: 'epic-1', title: 'Epic', goal: 'Goal', status: 'todo', featureIds: ['feature-1'] };
  state.execution.blockedTaskIds.push('task-1');
  state.failures.push({
    id: 'failure-1', taskId: 'task-1', role: 'reviewer', reason: 'failed', symptoms: [], badPatterns: [], retrySuggested: false,
    status: 'dead_lettered', checkpointRunId: 'run-1', deadLetteredAt: new Date().toISOString(), createdAt: new Date().toISOString(),
  });
  const store = new InMemoryStateStore(state);
  const service = new ControlPlaneService(store, createLogger(makeRuntimeConfig(), { sink: () => {} }));

  await service.resumeFailure('failure-1');
  const loaded = await store.load();

  assert.equal(loaded.failures[0]?.status, 'resumed');
  assert.equal(loaded.backlog.tasks['task-1']?.status, 'todo');
  assert.equal(loaded.execution.blockedTaskIds.includes('task-1'), false);
});

test('ControlPlaneService replays task from failure checkpoint', async () => {
  const state = createEmptyProjectState({ projectId: 'project-1', projectName: 'Project', summary: 'Summary' });
  state.backlog.tasks['task-2'] = {
    id: 'task-2', featureId: 'feature-1', title: 'Task', kind: 'implementation', status: 'todo',
    priority: 'p1', dependsOn: [], acceptanceCriteria: ['done'], affectedModules: ['packages/execution'], estimatedRisk: 'medium',
  };
  state.backlog.features['feature-1'] = { id: 'feature-1', epicId: 'epic-1', title: 'Feature', outcome: 'Outcome', risks: [], taskIds: ['task-2'] };
  state.backlog.epics['epic-1'] = { id: 'epic-1', title: 'Epic', goal: 'Goal', status: 'todo', featureIds: ['feature-1'] };
  state.failures.push({
    id: 'failure-2', taskId: 'task-2', role: 'tester', reason: 'failed', symptoms: [], badPatterns: [], retrySuggested: true,
    status: 'retryable', checkpointRunId: 'run-2', checkpointStepId: 'step-5', createdAt: new Date().toISOString(),
  });
  const store = new InMemoryStateStore(state);
  const service = new ControlPlaneService(store, createLogger(makeRuntimeConfig(), { sink: () => {} }));

  const result = await service.replayFromFailureCheckpoint('failure-2');
  const loaded = await store.load();

  assert.equal(result.taskId, 'task-2');
  assert.equal(loaded.execution.activeTaskId, 'task-2');
  assert.equal(loaded.execution.activeRunId, 'run-2');
  assert.equal(loaded.failures[0]?.status, 'replayed');
});
