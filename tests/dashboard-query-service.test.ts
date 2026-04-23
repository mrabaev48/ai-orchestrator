import assert from 'node:assert/strict';
import test from 'node:test';

import { DashboardQueryService } from '../packages/application/src/index.ts';
import {
  createEmptyProjectState,
  makeEvent,
} from '../packages/core/src/index.ts';
import { InMemoryStateStore } from '../packages/state/src/index.ts';

test('DashboardQueryService returns state summary view from current state', async () => {
  const state = createEmptyProjectState({
    projectId: 'project-1',
    projectName: 'Project',
    summary: 'Summary',
  });
  const store = new InMemoryStateStore(state);
  const service = new DashboardQueryService(store);

  const summary = await service.getStateSummary();

  assert.equal(summary.projectId, 'project-1');
  assert.equal(summary.projectName, 'Project');
  assert.equal(summary.counts.tasks, 0);
});

test('DashboardQueryService returns backlog export view in both formats', async () => {
  const state = createEmptyProjectState({
    projectId: 'project-1',
    projectName: 'Project',
    summary: 'Summary',
  });
  const store = new InMemoryStateStore(state);
  const service = new DashboardQueryService(store);

  const exportView = await service.getBacklogExport();

  assert.match(exportView.markdown, /# Backlog export/);
  assert.equal(typeof exportView.json, 'string');
});

test('DashboardQueryService returns paginated history views and latest run summary', async () => {
  const state = createEmptyProjectState({
    projectId: 'project-1',
    projectName: 'Project',
    summary: 'Summary',
  });
  state.decisions.push({
    id: 'decision-1',
    title: 'Use PostgreSQL',
    decision: 'Keep PostgreSQL for now',
    rationale: 'Enough for local MVP',
    affectedAreas: ['state'],
    createdAt: '2026-03-10T00:00:00.000Z',
  });
  state.failures.push({
    id: 'failure-1',
    taskId: 'task-1',
    role: 'reviewer',
    reason: 'Missing tests',
    symptoms: ['coverage gap'],
    badPatterns: ['skip tests'],
    retrySuggested: true,
    createdAt: '2026-03-10T01:00:00.000Z',
  });
  state.artifacts.push({
    id: 'artifact-1',
    type: 'run_summary',
    title: 'Latest run',
    metadata: {
      taskId: 'task-1',
      summary: 'Task completed',
    },
    createdAt: '2026-03-10T02:00:00.000Z',
  });

  const store = new InMemoryStateStore(state);
  await store.recordEvent(makeEvent('TASK_COMPLETED', {
    taskId: 'task-1',
    summary: 'Task completed',
  }, {
    runId: 'run-1',
  }));

  const service = new DashboardQueryService(store);
  const events = await service.getEvents({ limit: 10, offset: 0 });
  const failures = await service.getFailures({ taskId: 'task-1' });
  const decisions = await service.getDecisions();
  const artifacts = await service.getArtifacts({ type: 'run_summary' });
  const latestRun = await service.getLatestRunSummary();

  assert.equal(events.items[0]?.type, 'TASK_COMPLETED');
  assert.equal(failures.items[0]?.taskId, 'task-1');
  assert.equal(decisions.items[0]?.title, 'Use PostgreSQL');
  assert.equal(artifacts.items[0]?.type, 'run_summary');
  assert.equal(latestRun?.taskId, 'task-1');
});
