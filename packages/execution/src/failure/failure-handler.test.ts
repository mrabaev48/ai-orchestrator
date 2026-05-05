import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyProjectState, type BacklogTask } from '@ai-orchestrator/core';
import { InMemoryStateStore } from '@ai-orchestrator/state';
import type { RuntimeConfig } from '@ai-orchestrator/shared';

import { RunStepRecorder } from '../persistence/run-step-recorder.js';
import { FailureHandler } from './failure-handler.js';

function makeConfig(maxRetriesPerTask: number): RuntimeConfig {
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
      snapshotOnBootstrap: true,
      snapshotOnTaskCompletion: true,
      snapshotOnMilestoneCompletion: true,
    },
    workflow: {
      maxStepsPerRun: 5,
      maxRetriesPerTask,
      qualityGateMode: 'synthetic',
    },
    tools: {
      allowedWritePaths: [process.cwd()],
      typescriptDiagnosticsEnabled: true,
      allowedShellCommands: ['node', 'npm', 'pnpm', 'git'],
      persistToolEvidence: true,
    },
    logging: {
      level: 'error',
      format: 'json',
    },
  };
}

function makeTask(input: Partial<BacklogTask> = {}): BacklogTask {
  return {
    id: 'task-1',
    featureId: 'feature-1',
    title: 'Implement runtime block',
    kind: 'implementation',
    status: 'todo',
    priority: 'p0',
    dependsOn: [],
    acceptanceCriteria: ['done'],
    affectedModules: ['packages/execution'],
    estimatedRisk: 'medium',
    ...input,
  };
}

function makeHandler(maxRetriesPerTask: number) {
  const state = createEmptyProjectState({
    projectId: 'p1',
    projectName: 'Project',
    summary: 'Summary',
  });
  const task = makeTask();
  state.backlog.tasks[task.id] = task;
  state.backlog.features['feature-1'] = {
    id: 'feature-1',
    epicId: 'epic-1',
    title: 'Feature',
    outcome: 'Outcome',
    risks: [],
    taskIds: [task.id],
  };
  state.backlog.epics['epic-1'] = {
    id: 'epic-1',
    title: 'Epic',
    goal: 'Goal',
    status: 'todo',
    featureIds: ['feature-1'],
  };
  const store = new InMemoryStateStore(state);
  const runStepRecorder = new RunStepRecorder(store);
  const handler = new FailureHandler({
    stateStore: store,
    config: makeConfig(maxRetriesPerTask),
    runStepRecorder,
  });
  return { handler, state, task };
}

test('FailureHandler saves retryable failure without blocking task', async () => {
  const { handler, state, task } = makeHandler(3);

  const result = await handler.handle({
    state,
    task,
    role: 'tester',
    reason: 'test_failed',
    runId: 'run-1',
  });

  assert.equal(result.status, 'idle');
  assert.equal(state.execution.retryCounts[task.id], 1);
  assert.equal(state.failures[0]?.status, 'retryable');
  assert.equal(task.status, 'todo');
});

test('FailureHandler splits exhausted root task and rewrites dependents', async () => {
  const { handler, state, task } = makeHandler(1);
  state.backlog.tasks['dependent'] = makeTask({
    id: 'dependent',
    dependsOn: [task.id],
  });

  const result = await handler.handle({
    state,
    task,
    role: 'tester',
    reason: 'test_failed',
    runId: 'run-1',
  });

  assert.equal(result.stopReason, 'task_split');
  assert.equal(task.status, 'superseded');
  assert.equal(state.backlog.tasks['dependent']?.dependsOn.includes(task.id), false);
  assert.equal(Object.values(state.backlog.tasks).some((candidate) => candidate.splitFromTaskId === task.id), true);
});

test('FailureHandler blocks exhausted split task with dead-letter metadata', async () => {
  const { handler, state, task } = makeHandler(1);
  state.backlog.tasks['parent-task'] = makeTask({ id: 'parent-task' });
  task.splitFromTaskId = 'parent-task';

  const result = await handler.handle({
    state,
    task,
    role: 'reviewer',
    reason: 'review_rejected',
    runId: 'run-1',
  });

  assert.equal(result.status, 'blocked');
  assert.equal(task.status, 'blocked');
  assert.equal(state.execution.blockedTaskIds.includes(task.id), true);
  assert.equal(state.failures[0]?.status, 'dead_lettered');
  assert.equal(typeof state.failures[0]?.deadLetteredAt, 'string');
});
