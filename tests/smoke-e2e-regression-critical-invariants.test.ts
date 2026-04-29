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
import type { DomainEventType } from '../packages/core/src/index.ts';
import { Orchestrator } from '../packages/execution/src/index.ts';
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
      qualityGateMode: 'synthetic',
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

function makeRegistry(): RoleRegistry {
  const registry = new RoleRegistry();
  registry.register(new TaskManagerRole());
  registry.register(new PromptEngineerRole());
  registry.register(new CoderRole());
  registry.register(new ReviewerRole());
  registry.register(new TesterRole());
  return registry;
}

function makeState(acceptanceCriteria: string[] = ['done']) {
  const state = createEmptyProjectState({
    projectId: 'p1',
    projectName: 'Project',
    summary: 'Summary',
  });

  state.backlog.tasks['task-1'] = {
    id: 'task-1',
    featureId: 'feature-1',
    title: 'Implement critical flow',
    kind: 'implementation',
    status: 'todo',
    priority: 'p0',
    dependsOn: [],
    acceptanceCriteria,
    affectedModules: ['packages/execution'],
    estimatedRisk: 'high',
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

function assertCriticalFlow(
  eventTypes: DomainEventType[],
  expectedOrder: DomainEventType[],
): void {
  assert.deepEqual(
    eventTypes.filter((eventType) => eventType !== 'METRIC_RECORDED'),
    expectedOrder,
  );
}

test('smoke/e2e: critical happy path preserves select->execute->review->test->persist invariants', async () => {
  const store = new InMemoryStateStore(makeState());
  const logger = createLogger(makeRuntimeConfig(), { sink: () => {} });
  const orchestrator = new Orchestrator(store, makeRegistry(), makeRuntimeConfig(), logger);

  const result = await orchestrator.runCycle();
  const state = await store.load();

  assert.equal(result.status, 'completed');
  assert.equal(state.backlog.tasks['task-1']?.status, 'done');
  assert.equal(state.execution.completedTaskIds.includes('task-1'), true);

  const eventTypes = store.events.map((event) => event.eventType);
  assertCriticalFlow(eventTypes, [
    'TASK_SELECTED',
    'PROMPT_GENERATED',
    'ROLE_EXECUTED',
    'REVIEW_APPROVED',
    'TEST_PASSED',
    'STATE_COMMITTED',
  ]);

  assert.equal(
    store.events.every((event) => event.runId === result.runId),
    true,
    'all emitted events should correlate to the same run id',
  );

  assert.equal(
    state.artifacts.some((artifact) => artifact.type === 'optimized_prompt'),
    true,
    'optimized prompt artifact should be persisted for traceability',
  );
  assert.equal(
    state.artifacts.some((artifact) => artifact.type === 'run_summary'),
    true,
    'successful run persists at least one run summary artifact',
  );
  assert.equal(
    state.artifacts.filter((artifact) => artifact.type === 'run_summary').length,
    2,
    'task and run summaries should both persist',
  );
});

test('smoke/e2e: review rejection keeps task uncommitted and records structured failure', async () => {
  const store = new InMemoryStateStore(makeState(['[reject] force review rejection']));
  const logger = createLogger(makeRuntimeConfig(), { sink: () => {} });
  const orchestrator = new Orchestrator(store, makeRegistry(), makeRuntimeConfig(), logger);

  const result = await orchestrator.runCycle();
  const state = await store.load();

  assert.equal(result.status, 'idle');
  assert.equal(result.stopReason, 'review_rejected');
  assert.equal(state.backlog.tasks['task-1']?.status, 'todo');
  assert.equal(state.execution.completedTaskIds.includes('task-1'), false);
  assert.equal(state.execution.retryCounts['task-1'], 1);
  assert.equal(state.execution.activeTaskId, undefined);
  assert.equal(state.failures.at(-1)?.role, 'reviewer');
  assert.equal(state.failures.at(-1)?.reason, 'review_rejected');

  const eventTypes = store.events.map((event) => event.eventType);
  assertCriticalFlow(eventTypes, [
    'TASK_SELECTED',
    'PROMPT_GENERATED',
    'ROLE_EXECUTED',
    'REVIEW_REJECTED',
  ]);
  assert.equal(eventTypes.includes('STATE_COMMITTED'), false);
  assert.equal(eventTypes.includes('TEST_PASSED'), false);
  assert.equal(eventTypes.includes('TEST_FAILED'), false);
});

test('smoke/e2e: test failure keeps task uncommitted and records structured failure', async () => {
  const store = new InMemoryStateStore(makeState(['[fail-test] force tester failure']));
  const logger = createLogger(makeRuntimeConfig(), { sink: () => {} });
  const orchestrator = new Orchestrator(store, makeRegistry(), makeRuntimeConfig(), logger);

  const result = await orchestrator.runCycle();
  const state = await store.load();

  assert.equal(result.status, 'idle');
  assert.equal(result.stopReason, 'test_failed');
  assert.equal(state.backlog.tasks['task-1']?.status, 'todo');
  assert.equal(state.execution.completedTaskIds.includes('task-1'), false);
  assert.equal(state.execution.retryCounts['task-1'], 1);
  assert.equal(state.execution.activeTaskId, undefined);
  assert.equal(state.failures.at(-1)?.role, 'tester');
  assert.equal(state.failures.at(-1)?.reason, 'test_failed');

  const eventTypes = store.events.map((event) => event.eventType);
  assertCriticalFlow(eventTypes, [
    'TASK_SELECTED',
    'PROMPT_GENERATED',
    'ROLE_EXECUTED',
    'REVIEW_APPROVED',
    'TEST_FAILED',
  ]);
  assert.equal(eventTypes.includes('STATE_COMMITTED'), false);
});
