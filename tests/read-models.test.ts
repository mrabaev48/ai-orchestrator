import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyProjectState } from '../packages/core/src/index.ts';
import {
  toBacklogExportView,
  toStateSummaryView,
} from '../packages/application/src/index.ts';

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
    projectId: 'project-1',
    projectName: 'Project',
    summary: 'Summary',
    health: state.repoHealth,
    counts: {
      milestones: 0,
      tasks: 0,
      failures: 0,
      completedTasks: 1,
      blockedTasks: 1,
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
