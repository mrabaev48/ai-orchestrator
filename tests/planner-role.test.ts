import assert from 'node:assert/strict';
import test from 'node:test';

import { PlannerRole } from '../packages/agents/src/index.ts';
import { createEmptyProjectDiscovery, type ArchitectureFinding } from '../packages/core/src/index.ts';

test('PlannerRole produces milestone-aware backlog with dependencies and acceptance criteria', async () => {
  const role = new PlannerRole();
  const discovery = createEmptyProjectDiscovery();
  discovery.packageInventory = ['apps/control-plane', 'packages/application'];

  const findings: ArchitectureFinding[] = [
    {
      subsystem: 'runtime',
      issueType: 'critical_path_gap',
      description: 'Critical runtime path spans multiple packages',
      impact: 'Changes can regress across package boundaries',
      recommendation: 'Harden contracts',
      affectedModules: ['packages/application', 'packages/execution'],
      severity: 'high',
    },
    {
      subsystem: 'module_boundaries',
      issueType: 'contract_instability',
      description: 'Direct source imports cross package boundaries',
      impact: 'Refactors break internal imports',
      recommendation: 'Use package entrypoints',
      affectedModules: ['apps/control-plane/src/cli.ts'],
      severity: 'medium',
    },
  ];

  const response = await role.execute(
    {
      role: 'planner',
      objective: 'Plan backlog',
      input: { discovery, findings },
      acceptanceCriteria: ['Return structured backlog updates'],
    },
    {
      runId: 'run-1',
      role: 'planner',
      stateSummary: 'summary',
      toolProfile: {
        allowedWritePaths: [],
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

  const tasks = Object.values(response.output.backlog.tasks);
  assert.equal(response.output.milestone.status, 'in_progress');
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0]?.priority, 'p1');
  assert.equal(tasks[1]?.dependsOn.length, 1);
  assert.equal(tasks.every((task) => task.acceptanceCriteria.length > 0), true);
});
