import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CoderRole,
  PromptEngineerRole,
  ReviewerRole,
  RoleRegistry,
  TaskManagerRole,
  TesterRole,
} from '../packages/agents/src/index.ts';
import { createEmptyProjectState } from '../packages/core/src/index.ts';
import { Orchestrator } from '../packages/execution/src/index.ts';
import { InMemoryStateStore } from '../packages/state/src/index.ts';
import { createLogger, type RuntimeConfig } from '../packages/shared/src/index.ts';

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
    },
    logging: {
      level: 'error',
      format: 'json',
    },
  };
}

function makeRegistry(): RoleRegistry {
  const registry = new RoleRegistry();
  registry.register(new TaskManagerRole());
  registry.register(new PromptEngineerRole());
  registry.register(new CoderRole());
  registry.register(new ReviewerRole());
  registry.register(new TesterRole());
  return registry;
}

function makeState(acceptanceCriteria: string[] = ['done']): ReturnType<typeof createEmptyProjectState> {
  const state = createEmptyProjectState({
    projectId: 'p1',
    projectName: 'Project',
    summary: 'Summary',
  });
  state.backlog.tasks['task-1'] = {
    id: 'task-1',
    featureId: 'feature-1',
    title: 'Implement runtime block',
    kind: 'implementation',
    status: 'todo',
    priority: 'p0',
    dependsOn: [],
    acceptanceCriteria,
    affectedModules: ['packages/execution'],
    estimatedRisk: 'medium',
  };
  state.backlog.features['feature-1'] = {
    id: 'feature-1',
    epicId: 'epic-1',
    title: 'Feature 1',
    outcome: 'Outcome',
    risks: [],
    taskIds: ['task-1'],
  };
  state.backlog.epics['epic-1'] = {
    id: 'epic-1',
    title: 'Epic 1',
    goal: 'Goal',
    status: 'todo',
    featureIds: ['feature-1'],
  };
  return state;
}

test('runCycle happy path completes task and records summary artifact', async () => {
  const store = new InMemoryStateStore(makeState());
  const logger = createLogger(makeRuntimeConfig(), { sink: () => {} });
  const orchestrator = new Orchestrator(store, makeRegistry(), makeRuntimeConfig(), logger);

  const result = await orchestrator.runCycle();
  const state = await store.load();

  assert.equal(result.status, 'completed');
  assert.equal(state.backlog.tasks['task-1']?.status, 'done');
  assert.equal(state.execution.completedTaskIds.includes('task-1'), true);
  assert.equal(state.artifacts.some((artifact) => artifact.type === 'run_summary'), true);
});

test('runCycle blocks task after repeated review failures', async () => {
  const state = makeState(['[reject] review should fail']);
  state.backlog.tasks['task-1']!.splitFromTaskId = 'parent-task';
  state.backlog.tasks['parent-task'] = {
    id: 'parent-task',
    featureId: 'feature-1',
    title: 'Parent task',
    kind: 'implementation',
    status: 'blocked',
    priority: 'p0',
    dependsOn: [],
    acceptanceCriteria: ['done'],
    affectedModules: ['packages/execution'],
    estimatedRisk: 'medium',
  };
  state.execution.retryCounts['task-1'] = 1;
  const store = new InMemoryStateStore(state);
  const logger = createLogger(makeRuntimeConfig(), { sink: () => {} });
  const orchestrator = new Orchestrator(store, makeRegistry(), makeRuntimeConfig(), logger);

  const result = await orchestrator.runCycle();
  const loaded = await store.load();

  assert.equal(result.status, 'blocked');
  assert.equal(loaded.backlog.tasks['task-1']?.status, 'blocked');
  assert.equal(loaded.execution.blockedTaskIds.includes('task-1'), true);
  assert.equal(loaded.failures.length, 1);
});

test('runCycle splits parent task after repeated review failures', async () => {
  const state = makeState(['[reject] review should fail', 'keep scope narrow']);
  state.execution.retryCounts['task-1'] = 1;
  const store = new InMemoryStateStore(state);
  const logger = createLogger(makeRuntimeConfig(), { sink: () => {} });
  const orchestrator = new Orchestrator(store, makeRegistry(), makeRuntimeConfig(), logger);

  const result = await orchestrator.runCycle();
  const loaded = await store.load();

  assert.equal(result.status, 'idle');
  assert.equal(result.stopReason, 'task_split');
  assert.equal(loaded.backlog.tasks['task-1']?.status, 'blocked');
  assert.equal(loaded.backlog.tasks['task-1--part-1']?.splitFromTaskId, 'task-1');
  assert.equal(loaded.backlog.tasks['task-1--part-2']?.dependsOn[0], 'task-1--part-1');
  assert.equal(loaded.decisions.some((decision) => decision.title.includes('Split task task-1')), true);
  assert.equal(store.events.some((event) => event.eventType === 'TASK_SPLIT'), true);
});
