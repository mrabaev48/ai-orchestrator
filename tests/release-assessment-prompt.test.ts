import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReleaseAssessmentPrompt } from '../packages/prompts/src/index.ts';

test('buildReleaseAssessmentPrompt exposes release assessment schema', () => {
  const prompt = buildReleaseAssessmentPrompt({
    blockers: ['Tests failing'],
    warnings: ['Docs missing'],
    evidence: ['Repo health captured'],
  });

  assert.equal(prompt.role, 'release_auditor');
  assert.match(prompt.taskPrompt, /Known blockers: Tests failing/);
  assert.deepEqual(prompt.outputSchema.required, [
    'verdict',
    'confidence',
    'blockers',
    'warnings',
    'evidence',
    'recommendedNextActions',
  ]);
});
