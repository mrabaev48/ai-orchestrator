import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyProjectState } from '../packages/core/src/index.ts';
import {
  toArtifactHistoryView,
  toBacklogExportView,
  toDashboardStateView,
  toEventHistoryView,
  toLatestRunSummaryView,
  toMilestoneListView,
  toStateSummaryView,
} from '../packages/application/src/index.ts';
import { makeEvent } from '../packages/core/src/index.ts';

test('toStateSummaryView maps raw state into a stable read model', () => {
  const state = createEmptyProjectState({
    projectId: 'project-1',
    projectName: 'Project',
    summary: 'Summary',
  });
  state.execution.completedTaskIds.push('task-1');
  state.execution.blockedTaskIds.push('task-2');

  const view = toStateSummaryView(state);

  assert.deepEqual(view, {
    orgId: 'default-org',
    projectId: 'project-1',
    projectName: 'Project',
    summary: 'Summary',
    health: state.repoHealth,
    counts: {
      milestones: 0,
      tasks: 0,
      failures: 0,
      architectureFindings: 0,
      completedTasks: 1,
      blockedTasks: 1,
      pendingApprovals: 0,
    },
  });
});

test('toBacklogExportView returns markdown and json projections', () => {
  const state = createEmptyProjectState({
    projectId: 'project-1',
    projectName: 'Project',
    summary: 'Summary',
  });
  state.backlog.epics['epic-1'] = {
    id: 'epic-1',
    title: 'Epic',
    goal: 'Goal',
    status: 'todo',
    featureIds: ['feature-1'],
  };
  state.backlog.features['feature-1'] = {
    id: 'feature-1',
    epicId: 'epic-1',
    title: 'Feature',
    outcome: 'Outcome',
    risks: [],
    taskIds: ['task-1'],
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
    affectedModules: [],
    estimatedRisk: 'low',
  };

  const view = toBacklogExportView(state);

  assert.match(view.markdown, /# Backlog export/);
  assert.match(view.markdown, /## Epic/);
  assert.match(view.json, /"epic-1"/);
});

test('dashboard read models project safe milestone, event, artifact, and latest run views', () => {
  const state = createEmptyProjectState({
    projectId: 'project-1',
    projectName: 'Project',
    summary: 'Summary',
  });
  state.currentMilestoneId = 'm1';
  state.execution.activeTaskId = 'task-1';
  state.milestones.m1 = {
    id: 'm1',
    title: 'Bootstrap',
    goal: 'Initialize project',
    status: 'in_progress',
    epicIds: ['epic-1'],
    entryCriteria: ['repo ready'],
    exitCriteria: ['state ready'],
  };
  state.artifacts.push({
    id: 'artifact-1',
    type: 'run_summary',
    title: 'Latest run',
    metadata: {
      taskId: 'task-1',
      summary: 'Completed task',
      secretToken: 'hidden',
    },
    createdAt: '2026-03-10T00:00:00.000Z',
  });

  const stateView = toDashboardStateView(state);
  const milestoneView = toMilestoneListView(state);
  const eventView = toEventHistoryView([
    makeEvent('TASK_COMPLETED', {
      taskId: 'task-1',
      apiKey: 'hidden',
      summary: 'Completed task',
    }, {
      runId: 'run-1',
    }),
  ], {
    total: 1,
    limit: 25,
    offset: 0,
  });
  const artifactView = toArtifactHistoryView(state.artifacts, {
    total: 1,
    limit: 25,
    offset: 0,
  });
  const latestRunView = toLatestRunSummaryView(state);

  assert.equal(stateView.activeTaskId, 'task-1');
  assert.equal(milestoneView[0]?.isCurrent, true);
  assert.equal(eventView.items[0]?.taskId, 'task-1');
  assert.doesNotMatch(eventView.items[0]?.summary ?? '', /hidden/);
  assert.equal(artifactView.items[0]?.taskId, 'task-1');
  assert.equal(latestRunView?.summary, 'Completed task');
});
