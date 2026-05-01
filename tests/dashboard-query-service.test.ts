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

test('DashboardQueryService returns metrics and trace audit views', async () => {
  const state = createEmptyProjectState({
    projectId: 'project-1',
    projectName: 'Project',
    summary: 'Summary',
  });
  const store = new InMemoryStateStore(state);
  await store.recordEvent(makeEvent('METRIC_RECORDED', {
    metricType: 'counter',
    name: 'task_run_total',
    value: 1,
    tags: { taskId: 'task-1', status: 'completed' },
  }, { runId: 'run-1' }));
  await store.recordEvent(makeEvent('METRIC_RECORDED', {
    metricType: 'histogram',
    name: 'span_tool_invocation_duration_ms',
    value: 42,
    tags: { taskId: 'task-1', role: 'coder', toolName: 'file_read', status: 'ok', span: 'tool_invocation' },
  }, { runId: 'run-1' }));

  const service = new DashboardQueryService(store);
  const metrics = await service.getMetricsAudit();
  const traces = await service.getTraceAudit();

  assert.equal(metrics.items.some((item) => item.name === 'span_tool_invocation_duration_ms'), true);
  assert.equal(metrics.items.some((item) => item.name === 'task_run_total'), true);
  assert.equal(traces.items[0]?.spanName, 'span_tool_invocation_duration_ms');
  assert.equal(traces.items[0]?.durationMs, 42);
});

test('DashboardQueryService returns review bundle with timeline, diff intelligence and test evidence', async () => {
  const state = createEmptyProjectState({
    projectId: 'project-1',
    projectName: 'Project',
    summary: 'Summary',
  });
  state.artifacts.push({
    id: 'artifact-report',
    type: 'report',
    title: 'Test report passed',
    metadata: { summary: '2 files touched', filesChanged: '2', additions: '20', deletions: '4', runId: 'run-9' },
    createdAt: '2026-03-10T03:00:00.000Z',
  });
  state.artifacts.push({
    id: 'artifact-plan',
    type: 'test_plan',
    title: 'Regression plan',
    metadata: { runId: 'run-9' },
    createdAt: '2026-03-10T02:00:00.000Z',
  });
  const store = new InMemoryStateStore(state);
  await store.recordEvent(makeEvent('TASK_SELECTED', { taskId: 'task-9', summary: 'Task started' }, { runId: 'run-9' }));
  await store.recordEvent(makeEvent('TASK_COMPLETED', { taskId: 'task-9', summary: 'Task done' }, { runId: 'run-9' }));
  const service = new DashboardQueryService(store);

  const bundle = await service.getReviewBundle('run-9');

  assert.equal(bundle?.runId, 'run-9');
  assert.equal(bundle?.timeline.length, 2);
  assert.equal(bundle?.diff.filesChanged, 2);
  assert.equal(bundle?.testEvidence.length, 2);
  assert.equal(bundle?.prBundle.artifacts.length, 2);
});

test('DashboardQueryService returns readiness scorecard with go/no-go verdict', async () => {
  const state = createEmptyProjectState({
    projectId: 'project-1',
    projectName: 'Project',
    summary: 'Summary',
  });
  state.repoHealth.lint = 'passing';
  state.repoHealth.tests = 'passing';
  state.repoHealth.typecheck = 'passing';
  state.artifacts.push({
    id: 'doc-1',
    type: 'documentation',
    title: 'System docs',
    metadata: {},
    createdAt: '2026-04-01T00:00:00.000Z',
  });

  const service = new DashboardQueryService(new InMemoryStateStore(state));
  const scorecard = await service.getReadinessScorecard();

  assert.equal(scorecard.verdict, 'ready');
  assert.equal(scorecard.score.total, 6);
  assert.equal(scorecard.score.passed, 6);
  assert.equal(scorecard.criteria.some((criterion) => criterion.status === 'fail'), false);
});
