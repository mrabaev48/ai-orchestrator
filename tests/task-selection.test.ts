import test from 'node:test';
import assert from 'node:assert/strict';

import { createEmptyProjectState } from '../packages/core/src/index.ts';
import { selectNextTask } from '../packages/workflow/src/index.ts';

test('selectNextTask respects dependencies and priority', () => {
  const state = createEmptyProjectState({
    projectId: 'p1',
    projectName: 'Project',
    summary: 'Summary',
  });

  state.backlog.tasks['task-1'] = {
    id: 'task-1',
    featureId: 'f1',
    title: 'Low priority',
    kind: 'implementation',
    status: 'todo',
    priority: 'p2',
    dependsOn: [],
    acceptanceCriteria: ['done'],
    affectedModules: [],
    estimatedRisk: 'low',
  };
  state.backlog.tasks['task-2'] = {
    id: 'task-2',
    featureId: 'f1',
    title: 'High priority but blocked by dep',
    kind: 'implementation',
    status: 'todo',
    priority: 'p0',
    dependsOn: ['task-3'],
    acceptanceCriteria: ['done'],
    affectedModules: [],
    estimatedRisk: 'low',
  };
  state.backlog.tasks['task-3'] = {
    id: 'task-3',
    featureId: 'f1',
    title: 'Completed dep',
    kind: 'implementation',
    status: 'done',
    priority: 'p1',
    dependsOn: [],
    acceptanceCriteria: ['done'],
    affectedModules: [],
    estimatedRisk: 'low',
  };
  state.execution.completedTaskIds.push('task-3');

  const selected = selectNextTask(state);
  assert.equal(selected?.id, 'task-2');
});
