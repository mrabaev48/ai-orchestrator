import assert from 'node:assert/strict';
import test from 'node:test';

import { buildStateIntegrityPrompt } from '../packages/prompts/src/index.ts';

test('buildStateIntegrityPrompt exposes explainable integrity report schema', () => {
  const prompt = buildStateIntegrityPrompt({
    issueCount: 2,
    issues: ['Missing task reference', 'Blocked task lacks failure record'],
  });

  assert.equal(prompt.role, 'state_steward');
  assert.match(prompt.taskPrompt, /Detected issues: 2/);
  assert.deepEqual(prompt.outputSchema.required, ['ok', 'findings', 'summary']);
});
