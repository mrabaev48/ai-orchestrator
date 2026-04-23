import assert from 'node:assert/strict';
import test from 'node:test';

import { splitTaskForRetry } from '../packages/workflow/src/index.ts';

test('splitTaskForRetry creates traceable child tasks with narrowed dependencies', () => {
  const result = splitTaskForRetry(
    {
      id: 'task-1',
      featureId: 'feature-1',
      title: 'Implement runtime block',
      kind: 'implementation',
      status: 'todo',
      priority: 'p2',
      dependsOn: ['task-0'],
      acceptanceCriteria: ['criterion-1', 'criterion-2'],
      affectedModules: ['packages/execution'],
      estimatedRisk: 'medium',
    },
    'review_rejected',
  );

  assert.equal(result.parentTaskId, 'task-1');
  assert.equal(result.completionTaskId, 'task-1--part-2');
  assert.equal(result.childTasks[0].splitFromTaskId, 'task-1');
  assert.deepEqual(result.childTasks[0].dependsOn, ['task-0']);
  assert.deepEqual(result.childTasks[1].dependsOn, ['task-1--part-1']);
  assert.equal(result.childTasks[0].priority, 'p1');
});
