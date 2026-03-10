import assert from 'node:assert/strict';
import test from 'node:test';

import { buildIntegrationExportPrompt } from '../packages/prompts/src/index.ts';

test('buildIntegrationExportPrompt exposes export payload schema', () => {
  const prompt = buildIntegrationExportPrompt({
    taskCount: 3,
    artifactCount: 2,
    blockedTaskCount: 1,
  });

  assert.equal(prompt.role, 'integration_manager');
  assert.match(prompt.taskPrompt, /Tasks: 3/);
  assert.deepEqual(prompt.outputSchema.required, [
    'integrationTarget',
    'mappedEntities',
    'missingRequiredFields',
    'exportBlockers',
    'recommendedFixes',
  ]);
});
