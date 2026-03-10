import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDocsWriterPrompt } from '../packages/prompts/src/index.ts';

test('buildDocsWriterPrompt exposes structured documentation schema', () => {
  const prompt = buildDocsWriterPrompt({
    projectName: 'Project',
    summary: 'Summary',
    affectedModules: ['packages/application'],
    behaviorChanges: ['Added planner flow'],
  });

  assert.equal(prompt.role, 'docs_writer');
  assert.match(prompt.taskPrompt, /Affected modules: packages\/application/);
  assert.deepEqual(prompt.outputSchema.required, [
    'summary',
    'affectedModules',
    'behaviorChanges',
    'designRationale',
    'followUpGaps',
    'markdown',
  ]);
});
