import assert from 'node:assert/strict';
import test from 'node:test';

import { BootstrapAnalystRole } from '../packages/agents/src/index.ts';

test('BootstrapAnalystRole maps repository snapshot into reusable discovery output', async () => {
  const role = new BootstrapAnalystRole();

  const response = await role.execute(
    {
      role: 'bootstrap_analyst',
      objective: 'Establish repository baseline',
      input: {
        snapshot: {
          rootPath: '/repo',
          topLevelEntries: ['apps', 'packages', 'tests', 'package.json', 'tsconfig.json'],
          packageDirectories: ['apps/control-plane', 'packages/core', 'packages/execution'],
          packageMap: {
            'apps/control-plane': ['src'],
            'packages/core': ['src'],
            'packages/execution': ['src'],
          },
          manifests: ['package.json'],
          configFiles: ['tsconfig.json', 'eslint.config.mjs'],
          entryPoints: ['apps/control-plane/src', 'packages/core/src'],
          testInfrastructure: ['tests'],
        },
      },
      acceptanceCriteria: ['Return reusable discovery context'],
    },
    {
      runId: 'run-1',
      role: 'bootstrap_analyst',
      stateSummary: 'summary',
      toolProfile: {
        allowedWritePaths: ['/repo'],
        canWriteRepo: false,
        canApproveChanges: false,
        canRunTests: false,
      },
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        withContext: () => {
          throw new Error('not needed');
        },
      },
    },
  );

  role.validate?.(response);

  assert.deepEqual(response.output.packageInventory, [
    'apps/control-plane',
    'packages/core',
    'packages/execution',
  ]);
  assert.equal(response.output.recommendedNextStep, 'architecture_analysis');
  assert.deepEqual(response.output.subsystemMap.packages, [
    'packages/core',
    'packages/execution',
  ]);
  assert.match(response.output.healthObservations[0] ?? '', /package\.json/);
});
