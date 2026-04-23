import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createEmptyProjectState,
  validateProjectState,
} from '../packages/core/src/index.ts';

test('validateProjectState accepts a minimal empty state', () => {
  const state = createEmptyProjectState({
    projectId: 'proj-1',
    projectName: 'Project',
    summary: 'Summary',
  });

  const validation = validateProjectState(state);
  assert.equal(validation.ok, true);
  assert.deepEqual(validation.issues, []);
});

test('validateProjectState rejects broken task references and blocked tasks without records', () => {
  const state = createEmptyProjectState({
    projectId: 'proj-1',
    projectName: 'Project',
    summary: 'Summary',
  });

  state.backlog.tasks['task-1'] = {
    id: 'task-1',
    featureId: 'feature-1',
    title: 'Task',
    kind: 'implementation',
    status: 'blocked',
    priority: 'p1',
    dependsOn: ['missing-task'],
    acceptanceCriteria: ['works'],
    affectedModules: ['packages/core'],
    estimatedRisk: 'medium',
  };
  state.execution.blockedTaskIds.push('task-1');

  const validation = validateProjectState(state);
  assert.equal(validation.ok, false);
  assert.match(validation.issues.join('\n'), /missing task|requires a failure or artifact record/);
});

test('validateProjectState rejects invalid nested entities via deep schema checks', () => {
  const state = createEmptyProjectState({
    projectId: 'proj-1',
    projectName: 'Project',
    summary: 'Summary',
  });

  state.backlog.epics['epic-1'] = {
    id: 'epic-1',
    title: '',
    goal: 'Goal',
    status: 'todo',
    featureIds: [],
  };

  state.decisions.push({
    id: 'decision-1',
    title: 'Decision title',
    decision: 'Do something',
    rationale: 'Because',
    affectedAreas: ['core'],
    createdAt: 'not-a-date',
  });

  state.failures.push({
    id: 'failure-1',
    taskId: 'missing-task',
    role: 'tester',
    reason: 'Failure',
    symptoms: [''],
    badPatterns: [],
    retrySuggested: true,
    createdAt: new Date().toISOString(),
  });

  state.artifacts.push({
    id: 'artifact-1',
    type: 'report',
    title: 'Report',
    metadata: {
      taskId: '',
    },
    createdAt: new Date().toISOString(),
  });

  const validation = validateProjectState(state);
  assert.equal(validation.ok, false);
  assert.match(validation.issues.join('\n'), /backlog\.epics\.epic-1\.title/);
  assert.match(validation.issues.join('\n'), /decisions\.\[0\]\.createdAt/);
  assert.match(validation.issues.join('\n'), /failures\.\[0\]\.symptoms\.\[0\]/);
  assert.match(validation.issues.join('\n'), /artifacts\.\[0\]\.metadata\.taskId/);
});
