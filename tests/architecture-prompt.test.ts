import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildArchitectureAnalysisPrompt,
} from '../packages/prompts/src/index.ts';
import { createEmptyProjectDiscovery } from '../packages/core/src/index.ts';

test('buildArchitectureAnalysisPrompt exposes schema for structured findings', () => {
  const discovery = createEmptyProjectDiscovery();
  discovery.packageInventory = ['apps/control-plane', 'packages/application'];
  discovery.criticalPaths = ['apps/control-plane/src'];
  discovery.unstableAreaCandidates = ['packages/application'];

  const prompt = buildArchitectureAnalysisPrompt(discovery, 3);

  assert.equal(prompt.role, 'architect');
  assert.match(prompt.taskPrompt, /Observed source imports: 3/);
  assert.deepEqual(prompt.outputSchema.required, ['findings', 'riskSummary']);
});
