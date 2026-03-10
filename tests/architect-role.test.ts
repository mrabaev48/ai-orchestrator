import assert from 'node:assert/strict';
import test from 'node:test';

import { ArchitectRole } from '../packages/agents/src/index.ts';
import { createEmptyProjectDiscovery } from '../packages/core/src/index.ts';

test('ArchitectRole produces structured findings from discovery and source import evidence', async () => {
  const role = new ArchitectRole();
  const discovery = createEmptyProjectDiscovery();
  discovery.packageInventory = [
    'apps/control-plane',
    'packages/application',
    'packages/execution',
    'packages/workflow',
  ];
  discovery.criticalPaths = [
    'apps/control-plane/src',
    'packages/execution/src',
    'packages/workflow/src',
  ];
  discovery.unstableAreaCandidates = ['packages/execution', 'packages/workflow'];

  const response = await role.execute(
    {
      role: 'architect',
      objective: 'Analyze architecture',
      input: {
        discovery,
        sourceImports: {
          'apps/control-plane/src/cli.ts': [
            '../../../packages/application/src/index.ts',
          ],
        },
      },
      acceptanceCriteria: ['Return structured architecture findings'],
    },
    {
      runId: 'run-1',
      role: 'architect',
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

  assert.equal(response.output.findings.length, 2);
  assert.equal(response.output.findings[0]?.issueType, 'contract_instability');
  assert.match(response.output.riskSummary, /finding/);
});
