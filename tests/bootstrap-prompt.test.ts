import assert from 'node:assert/strict';
import test from 'node:test';

import { buildBootstrapAnalysisPrompt } from '../packages/prompts/src/index.ts';

test('buildBootstrapAnalysisPrompt exposes bootstrap role schema and repository context', () => {
  const prompt = buildBootstrapAnalysisPrompt({
    rootPath: '/repo',
    topLevelEntries: ['apps', 'packages', 'tests', 'package.json'],
    packageDirectories: ['apps/control-plane', 'packages/core'],
    packageMap: {
      'apps/control-plane': ['src'],
      'packages/core': ['src'],
    },
    manifests: ['package.json'],
    configFiles: ['tsconfig.json'],
    entryPoints: ['apps/control-plane/src'],
    testInfrastructure: ['tests'],
  });

  assert.equal(prompt.role, 'bootstrap_analyst');
  assert.match(prompt.taskPrompt, /apps\/control-plane/);
  assert.deepEqual(prompt.outputSchema.required, [
    'generatedAt',
    'packageMap',
    'subsystemMap',
    'packageInventory',
    'entryPoints',
    'testInfrastructure',
    'healthObservations',
    'unstableAreaCandidates',
    'criticalPaths',
    'recommendedNextStep',
  ]);
});
