import test from 'node:test';
import assert from 'node:assert/strict';

import { canTransitionStage } from '../packages/workflow/src/index.ts';

test('workflow stage machine allows valid transitions', () => {
  assert.equal(canTransitionStage('select_task', 'generate_prompt'), true);
  assert.equal(canTransitionStage('review', 'test'), true);
  assert.equal(canTransitionStage('commit', 'complete'), true);
});

test('workflow stage machine rejects invalid transitions', () => {
  assert.equal(canTransitionStage('select_task', 'commit'), false);
  assert.equal(canTransitionStage('complete', 'select_task'), false);
});
